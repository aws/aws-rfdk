/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AutoScalingGroup,
  BlockDeviceVolume,
  UpdateType,
} from '@aws-cdk/aws-autoscaling';
import {
  ICertificate,
} from '@aws-cdk/aws-certificatemanager';
import {
  Connections,
  IConnectable,
  InstanceType,
  Port,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Cluster,
  ContainerImage,
  Ec2TaskDefinition,
  LogDriver,
  PlacementConstraint,
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
import {
  ISecret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  IConstruct,
} from '@aws-cdk/core';

import {
  ECSConnectOptions,
  InstanceConnectOptions,
  IRepository,
  RenderQueueProps,
} from '.';

import {
  ConnectableApplicationEndpoint,
  ImportedAcmCertificate,
  LogGroupFactory,
  X509CertificatePem,
  X509CertificatePkcs12,
} from '../../core';
import {
  tagConstruct,
} from '../../core/lib/runtime-info';

import {
  RenderQueueConnection,
} from './rq-connection';

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
 *   with TLS enabled in production environments.
 */
export class RenderQueue extends RenderQueueBase implements IGrantable {
  /**
   * Container listening ports for each protocol.
   */
  private static readonly RCS_PROTO_PORTS = {
    [ApplicationProtocol.HTTP]: 8080,
    [ApplicationProtocol.HTTPS]: 4433,
  };

  /**
   * Regular expression that validates a hostname (portion in front of the subdomain).
   */
  private static readonly RE_VALID_HOSTNAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

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
   * The secret containing the cert chain for external connections.
   */
  private readonly certChain?: ISecret;

  /**
   * The listener on the ALB that is redirecting traffic to the RCS.
   */
  private readonly listener: ApplicationListener;

  /**
   * The ECS task for the RCS.
   */
  private readonly taskDefinition: Ec2TaskDefinition;

  constructor(scope: Construct, id: string, props: RenderQueueProps) {
    super(scope, id);

    // The RCS does not currently support horizontal scaling behind a load-balancer, so we limit to at most one instance
    if (props.renderQueueSize && props.renderQueueSize.min !== undefined && props.renderQueueSize.min > 1) {
      throw new Error(`renderQueueSize.min cannot be greater than 1 - got ${props.renderQueueSize.min}`);
    }
    if (props.renderQueueSize && props.renderQueueSize.desired !== undefined && props.renderQueueSize.desired > 1) {
      throw new Error(`renderQueueSize.desired cannot be greater than 1 - got ${props.renderQueueSize.desired}`);
    }

    let externalProtocol: ApplicationProtocol;
    if ( props.trafficEncryption?.externalTLS ) {
      externalProtocol = ApplicationProtocol.HTTPS;

      if ( (props.trafficEncryption.externalTLS.acmCertificate === undefined ) ===
      (props.trafficEncryption.externalTLS.rfdkCertificate === undefined) ) {
        throw new Error('Exactly one of externalTLS.acmCertificate and externalTLS.rfdkCertificate must be provided when using externalTLS.');
      } else if (props.trafficEncryption.externalTLS.rfdkCertificate ) {
        if (props.trafficEncryption.externalTLS.rfdkCertificate.certChain === undefined) {
          throw new Error('Provided rfdkCertificate does not contain a certificate chain.');
        }
        this.clientCert = new ImportedAcmCertificate(this, 'AcmCert', props.trafficEncryption.externalTLS.rfdkCertificate );
        this.certChain = props.trafficEncryption.externalTLS.rfdkCertificate.certChain;
      } else {
        if (props.trafficEncryption.externalTLS.acmCertificateChain === undefined) {
          throw new Error('externalTLS.acmCertificateChain must be provided when using externalTLS.acmCertificate.');
        }
        this.clientCert = props.trafficEncryption.externalTLS.acmCertificate;
        this.certChain = props.trafficEncryption.externalTLS.acmCertificateChain;
      }
    } else {
      externalProtocol = ApplicationProtocol.HTTP;
    }

    const internalProtocol = props.trafficEncryption?.internalProtocol ?? ApplicationProtocol.HTTPS;

    if (externalProtocol === ApplicationProtocol.HTTPS && !props.hostname) {
      throw new Error('A hostname must be provided when the external protocol is HTTPS');
    }

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
    });

    const minCapacity = props.renderQueueSize?.min ?? 1;
    if (minCapacity < 1) {
      throw new Error(`renderQueueSize.min capacity must be at least 1: got ${minCapacity}`);
    }
    this.asg = this.cluster.addCapacity('RCS Capacity', {
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      instanceType: props.instanceType ?? new InstanceType('c5.large'),
      minCapacity,
      desiredCapacity: props.renderQueueSize?.desired,
      maxCapacity: 1,
      blockDevices: [{
        deviceName: '/dev/xvda',
        // See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-ami-storage-config.html
        // We want the volume to be encrypted. The default AMI size is 30-GiB.
        volume: BlockDeviceVolume.ebs(30, { encrypted: true }),
      }],
      updateType: UpdateType.ROLLING_UPDATE,
    });

    /**
     * The ECS-optimized AMI that is defaulted to when adding capacity to a cluster does not include the awscli or unzip
     * packages as is the case with the standard Amazon Linux AMI. These are required by RFDK scripts to configure the
     * direct connection on the host container instances.
     */
    this.asg.userData.addCommands(
      'yum install -yq awscli unzip',
    );

    const externalPortNumber = RenderQueue.RCS_PROTO_PORTS[externalProtocol];
    const internalPortNumber = RenderQueue.RCS_PROTO_PORTS[internalProtocol];

    this.logGroup = LogGroupFactory.createOrFetch(this, 'LogGroupWrapper', id, {
      logGroupPrefix: '/renderfarm/',
      ...props.logGroupProps,
    });
    this.logGroup.grantWrite(this.asg);

    const taskDefinition = this.createTaskDefinition({
      image: props.images.remoteConnectionServer,
      portNumber: internalPortNumber,
      protocol: internalProtocol,
      repository: props.repository,
    });
    this.taskDefinition = taskDefinition;

    // The fully-qualified domain name to use for the ALB
    let loadBalancerFQDN: string | undefined;
    if (props.hostname) {
      const label = props.hostname.hostname ?? 'renderqueue';
      if (props.hostname.hostname && !RenderQueue.RE_VALID_HOSTNAME.test(label)) {
        throw new Error(`Invalid RenderQueue hostname: ${label}`);
      }
      loadBalancerFQDN = `${label}.${props.hostname.zone.zoneName}`;
    }

    const loadBalancer = new ApplicationLoadBalancer(this, 'LB', {
      vpc: this.cluster.vpc,
      vpcSubnets: props.vpcSubnetsAlb ?? { subnetType: SubnetType.PRIVATE, onePerAz: true },
      internetFacing: false,
      deletionProtection: props.deletionProtection ?? true,
    });

    this.pattern = new ApplicationLoadBalancedEc2Service(this, 'AlbEc2ServicePattern', {
      certificate: this.clientCert,
      cluster: this.cluster,
      desiredCount: props.renderQueueSize?.desired,
      domainZone: props.hostname?.zone,
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
      address: this.pattern.loadBalancer.loadBalancerDnsName,
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

    this.node.defaultChild = taskDefinition;

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
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
   * Adds AWS Managed Policies to the Render Queue so it is able to control Deadlines Spot Event Plugin.
   *
   * See: https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html for additonal information.
   *
   * @param includeResourceTracker Whether or not the Resource tracker admin policy should also be addd (Default: True)
   */
  public addSEPPolicies( includeResourceTracker: boolean = true): void {
    const sepPolicy = ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginAdminPolicy');
    this.taskDefinition.taskRole.addManagedPolicy(sepPolicy);

    if (includeResourceTracker) {
      const rtPolicy = ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAdminPolicy');
      this.taskDefinition.taskRole.addManagedPolicy(rtPolicy);
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
  }

  private createTaskDefinition(props: {
    image: ContainerImage,
    portNumber: number,
    protocol: ApplicationProtocol,
    repository: IRepository,
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

    const containerDefinition = taskDefinition.addContainer('ContainerDefinition', {
      image,
      memoryReservationMiB: 2048,
      environment,
      logging: LogDriver.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'RCS',
      }),
    });

    containerDefinition.addMountPoints(connection.readWriteMountPoint);

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
}
