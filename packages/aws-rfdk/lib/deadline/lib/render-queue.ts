/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  join,
} from 'path';
import {
  AutoScalingGroup,
  BlockDeviceVolume,
  UpdatePolicy,
} from '@aws-cdk/aws-autoscaling';
import {
  ICertificate,
} from '@aws-cdk/aws-certificatemanager';
import {
  Connections,
  IConnectable,
  InstanceType,
  ISecurityGroup,
  IVpc,
  Port,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Cluster,
  ContainerImage,
  Ec2TaskDefinition,
  LogDriver,
  PlacementConstraint,
  Scope,
  UlimitName,
} from '@aws-cdk/aws-ecs';
import {
  ApplicationLoadBalancedEc2Service,
} from '@aws-cdk/aws-ecs-patterns';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  CfnTargetGroup,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IGrantable,
  IPrincipal,
  ManagedPolicy,
  PolicyStatement,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  ILogGroup,
} from '@aws-cdk/aws-logs';
import { IHostedZone, IPrivateHostedZone, PrivateHostedZone } from '@aws-cdk/aws-route53';
import {
  ISecret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  IConstruct,
  Stack,
} from '@aws-cdk/core';

import {
  ECSConnectOptions,
  InstanceConnectOptions,
  IRepository,
  IVersion,
  RenderQueueExternalTLSProps,
  RenderQueueHostNameProps,
  RenderQueueProps,
  RenderQueueSizeConstraints,
  VersionQuery,
} from '.';

import {
  ConnectableApplicationEndpoint,
  ImportedAcmCertificate,
  LogGroupFactory,
  ScriptAsset,
  X509CertificatePem,
  X509CertificatePkcs12,
} from '../../core';
import {
  tagConstruct,
} from '../../core/lib/runtime-info';
import {
  RenderQueueConnection,
} from './rq-connection';
import { Version } from './version';
import {
  WaitForStableService,
} from './wait-for-stable-service';

/**
 * Interface for Deadline Render Queue.
 */
export interface IRenderQueue extends IConstruct, IConnectable {
  /**
   * The endpoint used to connect to the Render Queue
   */
  readonly endpoint: ConnectableApplicationEndpoint;

  /**
   * Configures an ECS cluster to be able to connect to a RenderQueue
   * @returns An environment mapping that is used to configure the Docker Images
   */
  configureClientECS(params: ECSConnectOptions): { [name: string]: string };

  /**
   * Configure an Instance/Autoscaling group to connect to a RenderQueue
   */
  configureClientInstance(params: InstanceConnectOptions): void;
}

/**
 * Interface for information about the render queue's TLS configuration
 */
interface TlsInfo {
  /**
   * The certificate the Render Queue's server will use for the TLS connection.
   */
  readonly serverCert: ICertificate;

  /**
   * The certificate chain clients can use to verify the certificate.
   */
  readonly certChain: ISecret;

  /**
   * The private hosted zone that the render queue's load balancer will be placed in.
   */
  readonly domainZone: IPrivateHostedZone;

  /**
   * The fully qualified domain name that will be given to the load balancer in the private
   * hosted zone.
   */
  readonly fullyQualifiedDomainName: string;
}

/**
 * Base class for Render Queue providers
 */
abstract class RenderQueueBase extends Construct implements IRenderQueue {
  /**
   * The endpoint that Deadline clients can use to connect to the Render Queue
   */
  public abstract readonly endpoint: ConnectableApplicationEndpoint;

  /**
   * Allows specifying security group connections for the Render Queue.
   */
  public abstract readonly connections: Connections;

  /**
   * Configures an ECS cluster to be able to connect to a RenderQueue
   * @returns An environment mapping that is used to configure the Docker Images
   */
  public abstract configureClientECS(params: ECSConnectOptions): { [name: string]: string };

  /**
   * Configure an Instance/Autoscaling group to connect to a RenderQueue
   */
  public abstract configureClientInstance(params: InstanceConnectOptions): void;
}

/**
 * The RenderQueue construct deploys an Elastic Container Service (ECS) service that serves Deadline's REST HTTP API
 * to Deadline Clients.
 *
 * Most Deadline clients will connect to a Deadline render farm via the the RenderQueue. The API provides Deadline
 * clients access to Deadline's database and repository file-system in a way that is secure, performant, and scalable.
 *
 * ![architecture diagram](/diagrams/deadline/RenderQueue.svg)
 *
 * Resources Deployed
 * ------------------------
 * - An Amazon Elastic Container Service (ECS) cluster.
 * - An AWS EC2 auto-scaling group that provides the instances that host the ECS service.
 * - An ECS service with a task definition that deploys the Deadline Remote Connetion Server (RCS) in a container.
 * - A Amazon CloudWatch log group for streaming logs from the Deadline RCS.
 * - An application load balancer, listener and target group that balance incoming traffic among the RCS containers.
 *
 * Security Considerations
 * ------------------------
 * - The instances deployed by this construct download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - Care must be taken to secure what can connect to the RenderQueue. The RenderQueue does not authenticate API
 *   requests made against it. You must limit access to the RenderQueue endpoint to only trusted hosts. Those hosts
 *   should be governed carefully, as malicious software could use the API to remotely execute code across the entire render farm.
 * - The RenderQueue can be deployed with network encryption through Transport Layer Security (TLS) or without it. Unencrypted
 *   network communications can be eavesdropped upon or modified in transit. We strongly recommend deploying the RenderQueue
 *   with TLS enabled in production environments and it is configured to be on by default.
 */
export class RenderQueue extends RenderQueueBase implements IGrantable {
  /**
   * Container listening ports for each protocol.
   */
  private static readonly RCS_PROTO_PORTS = {
    [ApplicationProtocol.HTTP]: 8080,
    [ApplicationProtocol.HTTPS]: 4433,
  };

  private static readonly DEFAULT_HOSTNAME = 'renderqueue';

  private static readonly DEFAULT_DOMAIN_NAME = 'aws-rfdk.com';

  /**
  * The minimum Deadline version required for the Remote Connection Server to support load-balancing
  */
  private static readonly MINIMUM_LOAD_BALANCING_VERSION = new Version([10, 1, 10, 0]);

  // TODO: Update this with the version of Deadline that includes the changes for RFDK Secrets Management.
  // This is a temporary minimum version until this feature branch is merged
  /**
   * The minimum Deadline version required to enable Deadline Secrets Management on the Render Queue.
   */
  private static readonly MINIMUM_SECRETS_MANAGEMENT_VERSION = new Version([10, 1, 15, 0]);

  /**
   * Regular expression that validates a hostname (portion in front of the subdomain).
   */
  private static readonly RE_VALID_HOSTNAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  /**
   * Information for the RCS user.
   */

  private static readonly RCS_USER = { uid: 1000, gid: 1000, username: 'ec2-user' };

  /**
   * The principal to grant permissions to.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * The Amazon ECS cluster that is hosting the fleet of Deadline RCS applications.
   */
  public readonly cluster: Cluster;

  /**
   * @inheritdoc
   */
  public readonly connections: Connections;

  /**
   * @inheritdoc
   */
  public readonly endpoint: ConnectableApplicationEndpoint;

  /**
   * The application load balancer that serves the traffic.
   */
  public readonly loadBalancer: ApplicationLoadBalancer;

  /**
   * The Amazon EC2 Auto Scaling Group within the {@link RenderQueue.cluster}
   * that contains the Deadline RCS's instances.
   */
  public readonly asg: AutoScalingGroup;

  /**
   * The version of Deadline that the RenderQueue uses
   */
  public readonly version: IVersion;

  /**
   * The secret containing the cert chain for external connections.
   */
  public readonly certChain?: ISecret;

  /**
   * Whether SEP policies have been added
   */
  private haveAddedSEPPolicies: boolean = false;

  /**
   * Whether Resource Tracker policies have been added
   */
  private haveAddedResourceTrackerPolicies: boolean = false;

  /**
   * The log group where the RCS container will log to
   */
  private readonly logGroup: ILogGroup;

  /**
   * Instance of the Application Load Balanced EC2 service pattern.
   */
  private readonly pattern: ApplicationLoadBalancedEc2Service;

  /**
   * The certificate used by the ALB for external Traffic
   */
  private readonly clientCert?: ICertificate;

  /**
   * The connection object that contains the logic for how clients can connect to the Render Queue.
   */
  private readonly rqConnection: RenderQueueConnection;

  /**
   * Constraints on the number of Deadline RCS processes that can be run as part of this
   * RenderQueue.
   */
  private readonly renderQueueSize: RenderQueueSizeConstraints;

  /**
   * The listener on the ALB that is redirecting traffic to the RCS.
   */
  private readonly listener: ApplicationListener;

  /**
   * The ECS task for the RCS.
   */
  private readonly taskDefinition: Ec2TaskDefinition;

  /**
   * Depend on this to ensure that ECS Service is stable.
   */
  private ecsServiceStabilized: WaitForStableService;

  constructor(scope: Construct, id: string, props: RenderQueueProps) {
    super(scope, id);

    this.renderQueueSize = props?.renderQueueSize ?? {min: 1, max: 1};

    if (props.version.isLessThan(RenderQueue.MINIMUM_LOAD_BALANCING_VERSION)) {
      // Deadline versions earlier than 10.1.10 do not support horizontal scaling behind a load-balancer, so we limit to at most one instance
      if ((this.renderQueueSize.min ?? 0) > 1) {
        throw new Error(`renderQueueSize.min for Deadline version less than ${RenderQueue.MINIMUM_LOAD_BALANCING_VERSION.toString()} cannot be greater than 1 - got ${this.renderQueueSize.min}`);
      }
      if ((this.renderQueueSize.desired ?? 0) > 1) {
        throw new Error(`renderQueueSize.desired for Deadline version less than ${RenderQueue.MINIMUM_LOAD_BALANCING_VERSION.toString()} cannot be greater than 1 - got ${this.renderQueueSize.desired}`);
      }
      if ((this.renderQueueSize.max ?? 0) > 1) {
        throw new Error(`renderQueueSize.max for Deadline version less than ${RenderQueue.MINIMUM_LOAD_BALANCING_VERSION.toString()} cannot be greater than 1 - got ${this.renderQueueSize.max}`);
      }
    }

    this.version = props?.version;

    const externalProtocol = props.trafficEncryption?.externalTLS?.enabled === false ? ApplicationProtocol.HTTP : ApplicationProtocol.HTTPS;
    let loadBalancerFQDN: string | undefined;
    let domainZone: IHostedZone | undefined;

    if ( externalProtocol ===  ApplicationProtocol.HTTPS ) {
      const tlsInfo = this.getOrCreateTlsInfo(props);

      this.certChain = tlsInfo.certChain;
      this.clientCert = tlsInfo.serverCert;
      loadBalancerFQDN = tlsInfo.fullyQualifiedDomainName;
      domainZone = tlsInfo.domainZone;
    } else {
      if (props.hostname) {
        loadBalancerFQDN = this.generateFullyQualifiedDomainName(props.hostname.zone, props.hostname.hostname);
        domainZone = props.hostname.zone;
      }
    }

    this.version = props.version;

    const internalProtocol = props.trafficEncryption?.internalProtocol ?? ApplicationProtocol.HTTPS;

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
    });

    const minCapacity = props.renderQueueSize?.min ?? 1;
    if (minCapacity < 1) {
      throw new Error(`renderQueueSize.min capacity must be at least 1: got ${minCapacity}`);
    }
    const maxCapacity = this.renderQueueSize.max ?? this.renderQueueSize?.desired;
    if (this.renderQueueSize?.desired && maxCapacity && this.renderQueueSize?.desired > maxCapacity) {
      throw new Error(`renderQueueSize.desired capacity cannot be more than ${maxCapacity}: got ${this.renderQueueSize.desired}`);
    }
    this.asg = this.cluster.addCapacity('RCS Capacity', {
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      instanceType: props.instanceType ?? new InstanceType('c5.large'),
      minCapacity,
      desiredCapacity: this.renderQueueSize?.desired,
      maxCapacity,
      blockDevices: [{
        deviceName: '/dev/xvda',
        // See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-ami-storage-config.html
        // We want the volume to be encrypted. The default AMI size is 30-GiB.
        volume: BlockDeviceVolume.ebs(30, { encrypted: true }),
      }],
      updateType: undefined, // Workaround -- See: https://github.com/aws/aws-cdk/issues/11581
      updatePolicy: UpdatePolicy.rollingUpdate(),
      // addCapacity doesn't specifically take a securityGroup, but it passes on its properties to the ASG it creates,
      // so this security group will get applied there
      // @ts-ignore
      securityGroup: props.securityGroups?.backend,
    });

    /**
     * The ECS-optimized AMI that is defaulted to when adding capacity to a cluster does not include the awscli or unzip
     * packages as is the case with the standard Amazon Linux AMI. These are required by RFDK scripts to configure the
     * direct connection on the host container instances.
     */
    this.asg.userData.addCommands(
      'yum install -yq awscli unzip',
    );
    if (props.enableLocalFileCaching ?? false) {
      // Has to be done before any filesystems mount.
      this.enableFilecaching(this.asg);
    }

    const externalPortNumber = RenderQueue.RCS_PROTO_PORTS[externalProtocol];
    const internalPortNumber = RenderQueue.RCS_PROTO_PORTS[internalProtocol];

    this.logGroup = LogGroupFactory.createOrFetch(this, 'LogGroupWrapper', id, {
      logGroupPrefix: '/renderfarm/',
      ...props.logGroupProps,
    });
    this.logGroup.grantWrite(this.asg);

    if (props.repository.secretsManagementSettings.enabled) {
      const errors = [];
      if (props.version.isLessThan(RenderQueue.MINIMUM_SECRETS_MANAGEMENT_VERSION)) {
        errors.push(`The supplied Deadline version (${props.version.versionString}) is lower than the minimum required version: ${RenderQueue.MINIMUM_SECRETS_MANAGEMENT_VERSION.toString()}`);
      }
      if (props.repository.secretsManagementSettings.credentials === undefined) {
        errors.push('The Repository does not have Secrets Management credentials');
      }
      if (internalProtocol !== ApplicationProtocol.HTTPS) {
        errors.push('The internal protocol on the Render Queue is not HTTPS.');
      }
      if (externalProtocol !== ApplicationProtocol.HTTPS) {
        errors.push('External TLS on the Render Queue is not enabled.');
      }
      if (errors.length > 0) {
        throw new Error(`Deadline Secrets Management is enabled on the supplied Repository but cannot be enabled on the Render Queue for the following reasons:\n${errors.join('\n')}`);
      }
    }
    const taskDefinition = this.createTaskDefinition({
      image: props.images.remoteConnectionServer,
      portNumber: internalPortNumber,
      protocol: internalProtocol,
      repository: props.repository,
      runAsUser: RenderQueue.RCS_USER,
      secretsManagementOptions: props.repository.secretsManagementSettings.enabled ? {
        credentials: props.repository.secretsManagementSettings.credentials!,
        posixUsername: RenderQueue.RCS_USER.username,
      } : undefined,
    });
    this.taskDefinition = taskDefinition;

    // The fully-qualified domain name to use for the ALB

    const loadBalancer = new ApplicationLoadBalancer(this, 'LB', {
      vpc: this.cluster.vpc,
      vpcSubnets: props.vpcSubnetsAlb ?? { subnetType: SubnetType.PRIVATE, onePerAz: true },
      internetFacing: false,
      deletionProtection: props.deletionProtection ?? true,
      securityGroup: props.securityGroups?.frontend,
    });

    this.pattern = new ApplicationLoadBalancedEc2Service(this, 'AlbEc2ServicePattern', {
      certificate: this.clientCert,
      cluster: this.cluster,
      desiredCount: this.renderQueueSize?.desired,
      domainZone,
      domainName: loadBalancerFQDN,
      listenerPort: externalPortNumber,
      loadBalancer,
      protocol: externalProtocol,
      taskDefinition,
      // This is required to right-size our host capacity and not have the ECS service block on updates. We set a memory
      // reservation, but no memory limit on the container. This allows the container's memory usage to grow unbounded.
      // We want 1:1 container to container instances to not over-spend, but this comes at the price of down-time during
      // cloudformation updates.
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      // This is required to ensure that the ALB listener's security group does not allow any ingress by default.
      openListener: false,
    });

    // An explicit dependency is required from the Service to the Client certificate
    // Otherwise cloud formation will try to remove the cert before the ALB using it is disposed.
    if (this.clientCert) {
      this.pattern.node.addDependency(this.clientCert);
    }

    // An explicit dependency is required from the service to the ASG providing its capacity.
    // See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-dependson.html
    this.pattern.service.node.addDependency(this.asg);

    this.loadBalancer = this.pattern.loadBalancer;
    // Enabling dropping of invalid HTTP header fields on the load balancer to prevent http smuggling attacks.
    this.loadBalancer.setAttribute('routing.http.drop_invalid_header_fields.enabled', 'true');

    if (props.accessLogs) {
      const accessLogsBucket = props.accessLogs.destinationBucket;

      // Policies are applied according to
      // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
      accessLogsBucket.addToResourcePolicy( new PolicyStatement({
        actions: ['s3:PutObject'],
        principals: [new ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [`${accessLogsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      }));
      accessLogsBucket.addToResourcePolicy(new PolicyStatement({
        actions: [ 's3:GetBucketAcl' ],
        principals: [ new ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [ accessLogsBucket.bucketArn ],
      }));

      this.loadBalancer.logAccessLogs(
        accessLogsBucket,
        props.accessLogs.prefix);
    }

    // Ensure tasks are run on separate container instances
    this.pattern.service.addPlacementConstraints(PlacementConstraint.distinctInstances());

    /**
     * Uses an escape-hatch to set the target group protocol to HTTPS. We cannot configure server certificate
     * validation, but at least traffic is encrypted and terminated at the application layer.
     */
    const listener = this.loadBalancer.node.findChild('PublicListener');
    this.listener = listener as ApplicationListener;
    const targetGroup = listener.node.findChild('ECSGroup') as ApplicationTargetGroup;
    const targetGroupResource = targetGroup.node.defaultChild as CfnTargetGroup;
    targetGroupResource.protocol = ApplicationProtocol[internalProtocol];
    targetGroupResource.port = internalPortNumber;

    this.grantPrincipal = taskDefinition.taskRole;

    this.connections = new Connections({
      defaultPort: Port.tcp(externalPortNumber),
      securityGroups: this.pattern.loadBalancer.connections.securityGroups,
    });

    this.endpoint = new ConnectableApplicationEndpoint({
      address: loadBalancerFQDN ?? this.pattern.loadBalancer.loadBalancerDnsName,
      port: externalPortNumber,
      connections: this.connections,
      protocol: externalProtocol,
    });

    if ( externalProtocol === ApplicationProtocol.HTTP ) {
      this.rqConnection = RenderQueueConnection.forHttp({
        endpoint: this.endpoint,
      });
    } else {
      this.rqConnection = RenderQueueConnection.forHttps({
        endpoint: this.endpoint,
        caCert: this.certChain!,
      });
    }

    props.repository.secretsManagementSettings.credentials?.grantRead(this);

    this.ecsServiceStabilized = new WaitForStableService(this, 'WaitForStableService', {
      service: this.pattern.service,
    });

    this.node.defaultChild = taskDefinition;

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  protected onValidate(): string[] {
    const validationErrors = [];

    // Using the output of VersionQuery across stacks can cause issues. CloudFormation stack outputs cannot change if
    // a resource in another stack is referencing it.
    if (this.version instanceof VersionQuery) {
      const versionStack = Stack.of(this.version);
      const thisStack = Stack.of(this);
      if (versionStack != thisStack) {
        validationErrors.push('A VersionQuery can not be supplied from a different stack');
      }
    }

    return validationErrors;
  }

  /**
   * @inheritdoc
   */
  public configureClientECS(param: ECSConnectOptions): { [name: string]: string } {
    param.hosts.forEach( host => this.addChildDependency(host) );
    return this.rqConnection.configureClientECS(param);
  }

  /**
   * @inheritdoc
   */
  public configureClientInstance(param: InstanceConnectOptions): void {
    this.addChildDependency(param.host);
    this.rqConnection.configureClientInstance(param);
  }

  /**
   * Adds AWS Managed Policies to the Render Queue so it is able to control Deadline's Spot Event Plugin.
   *
   * See: https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html for additonal information.
   *
   * @param includeResourceTracker Whether or not the Resource tracker admin policy should also be added (Default: True)
   */
  public addSEPPolicies(includeResourceTracker: boolean = true): void {
    if (!this.haveAddedSEPPolicies) {
      const sepPolicy = ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginAdminPolicy');
      this.taskDefinition.taskRole.addManagedPolicy(sepPolicy);
      this.haveAddedSEPPolicies = true;
    }

    if (!this.haveAddedResourceTrackerPolicies) {
      if (includeResourceTracker) {
        const rtPolicy = ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAdminPolicy');
        this.taskDefinition.taskRole.addManagedPolicy(rtPolicy);
        this.haveAddedResourceTrackerPolicies = true;
      }
    }
  }

  /**
   * Add an ordering dependency to another Construct.
   *
   * All constructs in the child's scope will be deployed after the RenderQueue has been deployed and is ready to recieve traffic.
   *
   * This can be used to ensure that the RenderQueue is fully up and serving queries before a client attempts to connect to it.
   *
   * @param child The child to make dependent upon this RenderQueue.
   */
  public addChildDependency(child: IConstruct): void {
    // Narrowly define the dependencies to reduce the probability of cycles
    // ex: cycles that involve the security group of the RenderQueue & child.
    child.node.addDependency(this.listener);
    child.node.addDependency(this.taskDefinition);
    child.node.addDependency(this.pattern.service);
    child.node.addDependency(this.ecsServiceStabilized);
  }

  /**
   * Adds security groups to the frontend of the Render Queue, which is its load balancer.
   * @param securityGroups The security groups to add.
   */
  public addFrontendSecurityGroups(...securityGroups: ISecurityGroup[]): void {
    securityGroups.forEach(securityGroup => this.loadBalancer.addSecurityGroup(securityGroup));
  }

  /**
   * Adds security groups to the backend components of the Render Queue, which consists of the AutoScalingGroup for the Deadline RCS.
   * @param securityGroups The security groups to add.
   */
  public addBackendSecurityGroups(...securityGroups: ISecurityGroup[]): void {
    securityGroups.forEach(securityGroup => this.asg.addSecurityGroup(securityGroup));
  }

  private enableFilecaching(asg: AutoScalingGroup): void {
    const script = ScriptAsset.fromPathConvention(this, 'FilecachingScript', {
      osType: asg.osType,
      baseName: 'enableCacheFilesd',
      rootDir: join(__dirname, '..', 'scripts'),
    });
    // A comment in userData to make this easier to test.
    asg.userData.addCommands('# RenderQueue file caching enabled');
    script.executeOn({
      host: asg,
    });
  }

  private createTaskDefinition(props: {
    image: ContainerImage,
    portNumber: number,
    protocol: ApplicationProtocol,
    repository: IRepository,
    runAsUser?: { uid: number, gid?: number },
    secretsManagementOptions?: { credentials: ISecret, posixUsername: string },
  }) {
    const { image, portNumber, protocol, repository } = props;

    const taskDefinition = new Ec2TaskDefinition(this, 'RCSTask');

    // Mount the repo filesystem to RenderQueue.HOST_REPO_FS_MOUNT_PATH
    const connection = repository.configureClientECS({
      containerInstances: {
        hosts: [this.asg],
      },
      containers: {
        taskDefinition,
      },
    });

    const environment = connection.containerEnvironment;

    if (protocol === ApplicationProtocol.HTTPS) {
      // Generate a self-signed X509 certificate, private key and passphrase for use by the RCS containers.
      // Note: the Application Load Balancer does not validate the certificate in any way.
      const rcsCertPem = new X509CertificatePem(this, 'TlsCaCertPem', {
        subject: {
          cn: 'renderfarm.local',
        },
      });
      const rcsCertPkcs = new X509CertificatePkcs12(this, 'TlsRcsCertBundle', {
        sourceCertificate: rcsCertPem,
      });
      [rcsCertPem.cert, rcsCertPkcs.cert, rcsCertPkcs.passphrase].forEach(secret => {
        secret.grantRead(taskDefinition.taskRole);
      });
      environment.RCS_TLS_CA_CERT_URI = rcsCertPem.cert.secretArn;
      environment.RCS_TLS_CERT_URI = rcsCertPkcs.cert.secretArn;
      environment.RCS_TLS_CERT_PASSPHRASE_URI = rcsCertPkcs.passphrase.secretArn;
      environment.RCS_TLS_REQUIRE_CLIENT_CERT = 'no';
    }

    if (props.secretsManagementOptions !== undefined) {
      environment.RCS_SM_CREDENTIALS_URI = props.secretsManagementOptions.credentials.secretArn;
    }

    // We can ignore this in test coverage because we always use RenderQueue.RCS_USER
    /* istanbul ignore next */
    const user = props.runAsUser ? `${props.runAsUser.uid}:${props.runAsUser.gid}` : undefined;
    const containerDefinition = taskDefinition.addContainer('ContainerDefinition', {
      image,
      memoryReservationMiB: 2048,
      environment,
      logging: LogDriver.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'RCS',
      }),
      user,
    });

    containerDefinition.addMountPoints(connection.readWriteMountPoint);

    if (props.secretsManagementOptions !== undefined) {
      // Create volume to persist the RSA keypairs generated by Deadline between ECS tasks
      // This makes it so subsequent ECS tasks use the same initial Secrets Management identity
      const volumeName = 'deadline-user-keypairs';
      taskDefinition.addVolume({
        name: volumeName,
        dockerVolumeConfiguration: {
          scope: Scope.SHARED,
          autoprovision: true,
          driver: 'local',
        },
      });

      // Mount the volume into the container at the location where Deadline expects it
      containerDefinition.addMountPoints({
        readOnly: false,
        sourceVolume: volumeName,
        containerPath: `/home/${props.secretsManagementOptions.posixUsername}/.config/.mono/keypairs`,
      });
    }

    // Increase ulimits
    containerDefinition.addUlimits(
      {
        name: UlimitName.NOFILE,
        softLimit: 200000,
        hardLimit: 200000,
      }, {
        name: UlimitName.NPROC,
        softLimit: 64000,
        hardLimit: 64000,
      },
    );

    containerDefinition.addPortMappings({
      containerPort: portNumber,
      hostPort: portNumber,
    });

    return taskDefinition;
  }

  /**
   * Checks if the user supplied any certificate to use for TLS and uses them, or creates defaults to use.
   * @param props
   * @returns TlsInfo either based on input to the render queue, or the created defaults
   */
  private getOrCreateTlsInfo(props: RenderQueueProps): TlsInfo {
    if ( (props.trafficEncryption?.externalTLS?.acmCertificate !== undefined ) ||
        (props.trafficEncryption?.externalTLS?.rfdkCertificate !== undefined) ) {
      if (props.hostname === undefined) {
        throw new Error('The hostname for the render queue must be defined if supplying your own certificates.');
      }
      return this.getTlsInfoFromUserProps(
        props.trafficEncryption.externalTLS,
        props.hostname,
      );
    }

    return this.createDefaultTlsInfo(props.vpc, props.hostname);
  }

  /**
   * Creates a default certificate to use for TLS and a PrivateHostedZone to put the load balancer in.
   * @param vpc
   * @param hostname
   * @returns default TlsInfo
   */
  private createDefaultTlsInfo(vpc: IVpc, hostname?: RenderQueueHostNameProps) {
    const domainZone = hostname?.zone ?? new PrivateHostedZone(this, 'DnsZone', {
      vpc: vpc,
      zoneName: RenderQueue.DEFAULT_DOMAIN_NAME,
    });

    const fullyQualifiedDomainName = this.generateFullyQualifiedDomainName(domainZone, hostname?.hostname);

    const rootCa = new X509CertificatePem(this, 'RootCA', {
      subject: {
        cn: 'RenderQueueRootCA',
      },
    });
    const rfdkCert = new X509CertificatePem(this, 'RenderQueuePemCert', {
      subject: {
        cn: fullyQualifiedDomainName,
      },
      signingCertificate: rootCa,
    });
    const serverCert = new ImportedAcmCertificate( this, 'AcmCert', rfdkCert );
    const certChain = rfdkCert.certChain!;

    return {
      domainZone,
      fullyQualifiedDomainName,
      serverCert,
      certChain,
    };
  }

  /**
   * Gets the certificate and PrivateHostedZone provided in the Render Queue's construct props.
   * @param externalTLS
   * @param hostname
   * @returns The provided certificate and domain info
   */
  private getTlsInfoFromUserProps(externalTLS: RenderQueueExternalTLSProps, hostname: RenderQueueHostNameProps): TlsInfo {
    let serverCert: ICertificate;
    let certChain: ISecret;

    if ( (externalTLS.acmCertificate !== undefined ) &&
    (externalTLS.rfdkCertificate !== undefined) ) {
      throw new Error('Exactly one of externalTLS.acmCertificate and externalTLS.rfdkCertificate must be provided when using externalTLS.');
    }

    if (!hostname.hostname) {
      throw new Error('A hostname must be supplied if a certificate is supplied, '
        + 'with the common name of the certificate matching the hostname + domain name.');
    }

    const fullyQualifiedDomainName = this.generateFullyQualifiedDomainName(hostname.zone, hostname.hostname);

    if ( externalTLS.acmCertificate ) {
      if ( externalTLS.acmCertificateChain === undefined ) {
        throw new Error('externalTLS.acmCertificateChain must be provided when using externalTLS.acmCertificate.');
      }
      serverCert = externalTLS.acmCertificate;
      certChain = externalTLS.acmCertificateChain;

    } else { // Using externalTLS.rfdkCertificate
      if ( externalTLS.rfdkCertificate!.certChain === undefined ) {
        throw new Error('Provided rfdkCertificate does not contain a certificate chain.');
      }
      serverCert = new ImportedAcmCertificate( this, 'AcmCert', externalTLS.rfdkCertificate! );
      certChain = externalTLS.rfdkCertificate!.certChain;
    }

    return {
      domainZone: hostname.zone,
      fullyQualifiedDomainName,
      serverCert,
      certChain,
    };
  }

  /**
   * Helper method to create the fully qualified domain name for the given hostname and PrivateHostedZone.
   * @param hostname
   * @param zone
   * @returns The fully qualified domain name
   */
  private generateFullyQualifiedDomainName(zone: IPrivateHostedZone, hostname: string = RenderQueue.DEFAULT_HOSTNAME): string {
    if (!RenderQueue.RE_VALID_HOSTNAME.test(hostname)) {
      throw new Error(`Invalid RenderQueue hostname: ${hostname}`);
    }
    return `${hostname}.${zone.zoneName}`;
  }
}
