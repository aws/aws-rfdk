/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Annotations,
} from 'aws-cdk-lib';
import {
  AutoScalingGroup,
  BlockDeviceVolume,
} from 'aws-cdk-lib/aws-autoscaling';
import {
  IConnectable,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  IVpc,
  Port,
  SubnetSelection,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  CfnService,
  Cluster,
  Compatibility,
  ContainerImage,
  Ec2Service,
  LogDriver,
  NetworkMode,
  PlacementConstraint,
  TaskDefinition,
  UlimitName,
} from 'aws-cdk-lib/aws-ecs';
import {
  IGrantable,
  IPrincipal,
} from 'aws-cdk-lib/aws-iam';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import {
  LogGroupFactory,
  LogGroupFactoryProps,
} from '../../core';
import {
  tagConstruct,
} from '../../core/lib/runtime-info';
import {IRenderQueue} from './render-queue';
import {
  SecretsManagementRegistrationStatus,
  SecretsManagementRole,
} from '.';

/**
 * Properties for constructing a {@link UsageBasedLicense} instance.
 */
export interface UsageBasedLicenseProps {
  /**
   * The name of the product that the usage-based license applies to.
   */
  readonly licenseName: string;

  /**
   * The set of ports that are used for licensing traffic
   */
  readonly ports: Port[];

  /**
   * The maximum number of usage-based licenses that can be used concurrently.
   */
  readonly limit?: number;
}

/**
 * Instances of this class represent a usage-based license for a particular product.
 * It encapsulates all of the information specific to a product that the UsageBasedLicensing
 * construct requires to interoperate with that product.
 */
export class UsageBasedLicense {

  /**
   * Constant used to signify unlimited overage.
   */
  public static readonly UNLIMITED: number = 2147483647;

  /**
   * Method for 3dsMax license limit.
   *
   * @remark 3ds-Max usage-based licenses are not available with the UsageBasedLicensing
   * construct that deploys Deadline 10.1.9.
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static for3dsMax(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'max',
      ports: [Port.tcp(27002)],
      limit,
    });
  }

  /**
   * Method for Arnold license limit
   *
   * @remark 3ds-Max usage-based licenses are not available with the UsageBasedLicensing
   * construct that deploys Deadline 10.1.9.
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forArnold(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'arnold',
      ports: [Port.tcp(5056), Port.tcp(7056)],
      limit,
    });
  }

  /**
   * Method for Cinema 4D license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forCinema4D(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'cinema4d',
      ports: [Port.tcp(5057), Port.tcp(5058), Port.tcp(7057), Port.tcp(7058)],
      limit,
    });
  }

  /**
   * Method for Clarisse license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forClarisse(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'clarisse',
      ports: [Port.tcp(40500)],
      limit,
    });
  }

  /**
   * Method for Houdini license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forHoudini(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'houdini',
      ports: [Port.tcp(1715)],
      limit,
    });
  }

  /**
   * Method for Katana license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKatana(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'katana',
      ports: [Port.tcp(4151), Port.tcp(6101)],
      limit,
    });
  }

  /**
   * Method for KeyShot license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKeyShot(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'keyshot',
      ports: [Port.tcp(27003), Port.tcp(2703)],
      limit,
    });
  }

  /**
   * Method for krakatoa license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKrakatoa(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'krakatoa',
      ports: [Port.tcp(27000), Port.tcp(2700)],
      limit,
    });
  }

  /**
   * Method for Mantra license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forMantra(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'mantra',
      ports: [Port.tcp(1716)],
      limit,
    });
  }

  /**
   * Method for maxwell license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forMaxwell(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'maxwell',
      ports: [Port.tcp(5555), Port.tcp(7055)],
      limit,
    });
  }

  /**
   * Method for Maya license limit
   *
   * @remark 3ds-Max usage-based licenses are not available with the UsageBasedLicensing
   * construct that deploys Deadline 10.1.9.
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forMaya(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'maya',
      ports: [Port.tcp(27002), Port.tcp(2702)],
      limit,
    });
  }

  /**
   * Method for Nuke license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forNuke(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'nuke',
      ports: [Port.tcp(4101), Port.tcp(6101)],
      limit,
    });
  }

  /**
   * Method for RealFlow license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forRealFlow(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'realflow',
      ports: [Port.tcp(5055), Port.tcp(7055)],
      limit,
    });
  }

  /**
   * Method for RedShift license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forRedShift(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'redshift',
      ports: [Port.tcp(5054), Port.tcp(7054)],
      limit,
    });
  }

  /**
   * Method for V-Ray license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forVray(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'vray',
      ports: [Port.tcp(30306)],
      limit,
    });
  }

  /**
   * Method for Yeti license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forYeti(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense({
      licenseName: 'yeti',
      ports: [Port.tcp(5053), Port.tcp(7053)],
      limit,
    });
  }

  /**
   * The name of license limit
   */
  public readonly licenseName: string;

  /**
   * Ports that will be used for this license
   */
  public readonly ports: Port[];

  /**
   * Maximum count of licenses that will be used
   */
  public readonly limit?: number;

  constructor(props: UsageBasedLicenseProps) {
    this.licenseName = props.licenseName;
    this.ports = props.ports;
    this.limit = props.limit;
  }
}

/**
 * Set of container images used to serve the {@link UsageBasedLicensing} construct
 */
export interface UsageBasedLicensingImages {
  /**
   * The container image for the Deadline License Forwarder
   */
  readonly licenseForwarder: ContainerImage;
}

/**
 * Properties for the UsageBasedLicensing construct
 */
export interface UsageBasedLicensingProps {
  /**
   * VPC to launch the License Forwarder In
   */
  readonly vpc: IVpc;

  /**
   * Subnets within the VPC in which to host the UBLLicesing servers.
   *
   * @default All private subnets in the VPC.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The Deadline Render Queue, to which the License Forwarder needs to be connected.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * Type of instance that will be added to an AutoScalingGroup.
   *
   * @default - Will be used C5 Large instance
   */
  readonly instanceType?: InstanceType;

  /**
   * Docker Image for License Forwarder
   */
  readonly images: UsageBasedLicensingImages;

  /**
   * A secret with with 3rd Party Licensing Certificates.
   *
   * If you want to use 3rd Party Licensing Certificates you need to purchase render time on Thinkbox Marketplace
   * and download file with certificates.
   * File with certificates should be put in in a secret.
   */
  readonly certificateSecret: ISecret;

  /**
   * The desired number of Deadline License Forwarders that this construct keeps running.
   *
   * @default 1
   */
  readonly desiredCount?: number;

  /**
   * License limits that will be set in repository configuration
   */
  readonly licenses: UsageBasedLicense[];

  /**
   * Properties for setting up the Deadline License Forwarder's LogGroup in CloudWatch
   * @default - LogGroup will be created with all properties' default values to the LogGroup: /renderfarm/<construct id>
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * The security group to use for the License Forwarder
   * @default - A new security group will be created
   */
  readonly securityGroup?: ISecurityGroup;
}

/**
 * This construct is an implementation of the Deadline component that is required for Usage-based Licensing (UBL)
 * (see: https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/licensing-usage-based.html )
 * in a render farm.
 *
 * Internally this is implemented as one or more instances of the Deadline License Forwarder application set up
 * to communicate to the render queue and Thinkbox’s licensing system, and to allow ingress connections
 * from the worker nodes so that they can acquire licenses as needed.
 *
 * The Deadline License Forwarder is set up to run within an AWS ECS task.
 *
 * Access to the running License Forwarder is gated by a security group that, by default, only allows ingress from the
 * Render Queue (in order to register Workers for license forwarding).
 *
 * When a Deadline Worker requires access to licensing via `UsageBasedLicensing.grantPortAccess(...)`, then the RFDK
 * constructs will grant that worker’s security group ingress on TCP port 17004 as well as other ports as required by
 * the specific licenses being used.
 *
 * Note: This construct does not currently implement the Deadline License Forwarder's Web Forwarding functionality.
 * This construct is not usable in any China region.
 *
 * ![architecture diagram](/diagrams/deadline/UsageBasedLicensing.svg)
 *
 * Resources Deployed
 * ------------------------
 * - The Auto Scaling Group (ASG) added to the Amazon Elastic Container Service cluster that is hosting the Deadline
 *   License Forwarder for UBL. This creates one C5 Large instance by default.
 * - Amazon Elastic Block Store (EBS) device(s) associated with the EC2 instance(s) in the ASG. The default volume size is 30 GiB.
 * - An Amazon CloudWatch log group that contains the logs from the Deadline License Forwarder application.
 *
 * Security Considerations
 * ------------------------
 * - The instances deployed by this construct download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The Deadline License Forwarder is designed to be secured by restricting network access to it. For security, only the Deadline
 *   Workers that require access to Usage-based Licenses should be granted network access to the instances deployed by this construct.
 *   Futhermore, you should restrict that access to only the product(s) that those workers require when deploying this construct.
 */
export class UsageBasedLicensing extends Construct implements IGrantable {
  /**
   * The port that the License Forwarder listens on
   */
  private static readonly LF_PORT = 17004;

  /**
   * Default prefix for a LogGroup if one isn't provided in the props.
   */
  private static readonly DEFAULT_LOG_GROUP_PREFIX: string = '/renderfarm/';

  /**
   * The Amazon ECS cluster that is hosting the Deadline License Forwarder for UBL.
   */
  public readonly cluster: Cluster;

  /**
   * Autoscaling group for license forwarder instances
   */
  public readonly asg: AutoScalingGroup;

  /**
   * The principal to grant permissions to.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * The ECS service that serves usage based licensing.
   */
  public readonly service: Ec2Service;

  constructor(scope: Construct, id: string, props: UsageBasedLicensingProps) {
    super(scope, id);

    const usageBasedLicenses = new Array();

    props.licenses.forEach(license => {
      usageBasedLicenses.push(`${license.licenseName}:${license.limit ? license.limit : UsageBasedLicense.UNLIMITED}`);
    });

    if (usageBasedLicenses.length < 1) {
      throw new Error('Should be specified at least one license with defined limit.');
    }

    this.cluster = new Cluster(this, 'Cluster', { vpc: props.vpc });

    if (!props.vpcSubnets && props.renderQueue.repository.secretsManagementSettings.enabled) {
      Annotations.of(this).addWarning(
        'Deadline Secrets Management is enabled on the Repository and VPC subnets have not been supplied. Using dedicated subnets is recommended. See https://github.com/aws/aws-rfdk/blobs/release/packages/aws-rfdk/lib/deadline/README.md#using-dedicated-subnets-for-deadline-components',
      );
    }

    const vpcSubnets = props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE_WITH_EGRESS };

    this.asg = this.cluster.addCapacity('ASG', {
      vpcSubnets,
      instanceType: props.instanceType ? props.instanceType : InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
      minCapacity: props.desiredCount ?? 1,
      maxCapacity: props.desiredCount ?? 1,
      blockDevices: [ {
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs( 30, {encrypted: true}),
      }],
      // addCapacity doesn't specifically take a securityGroup, but it passes on its properties to the ASG it creates,
      // so this security group will get applied there
      // @ts-ignore
      securityGroup: props.securityGroup,
    });

    const taskDefinition = new TaskDefinition(this, 'TaskDefinition', {
      compatibility: Compatibility.EC2,
      networkMode: NetworkMode.HOST,
    });

    this.grantPrincipal = taskDefinition.taskRole;

    const containerEnv = {
      UBL_CERTIFICATES_URI: '',
      UBL_LIMITS: usageBasedLicenses.join(';'),
      ...props.renderQueue.configureClientECS({
        hosts: [this.asg],
        grantee: this,
      }),
    };

    containerEnv.UBL_CERTIFICATES_URI = props.certificateSecret.secretArn;
    props.certificateSecret.grantRead(taskDefinition.taskRole);

    const prefix = props.logGroupProps?.logGroupPrefix ?? UsageBasedLicensing.DEFAULT_LOG_GROUP_PREFIX;
    const defaultedLogGroupProps: LogGroupFactoryProps = {
      ...props.logGroupProps,
      logGroupPrefix: prefix,
    };
    const logGroup = LogGroupFactory.createOrFetch(this, 'LogGroupWrapper', id, defaultedLogGroupProps);
    logGroup.grantWrite(this.asg);

    const container = taskDefinition.addContainer('LicenseForwarderContainer', {
      image: props.images.licenseForwarder,
      environment: containerEnv,
      memoryReservationMiB: 1024,
      logging: LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'LicenseForwarder',
      }),
    });

    // Increase ulimits
    container.addUlimits({
      name: UlimitName.NOFILE,
      softLimit: 200000,
      hardLimit: 200000,
    }, {
      name: UlimitName.NPROC,
      softLimit: 64000,
      hardLimit: 64000,
    });

    this.service = new Ec2Service(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: props.desiredCount ?? 1,
      placementConstraints: [PlacementConstraint.distinctInstances()],
      // This is required to right-size our host capacity and not have the ECS service block on updates. We set a memory
      // reservation, but no memory limit on the container. This allows the container's memory usage to grow unbounded.
      // We want 1:1 container to container instances to not over-spend, but this comes at the price of down-time during
      // cloudformation updates.
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });

    // An explicit dependency is required from the service to the ASG providing its capacity.
    // See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-dependson.html
    this.service.node.addDependency(this.asg);

    this.node.defaultChild = this.service;

    if (props.renderQueue.repository.secretsManagementSettings.enabled) {
      props.renderQueue.configureSecretsManagementAutoRegistration({
        dependent: this.service.node.defaultChild as CfnService,
        registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
        role: SecretsManagementRole.CLIENT,
        vpc: props.vpc,
        vpcSubnets,
      });
    }

    // Grant the render queue the ability to connect to the license forwarder to register workers
    this.asg.connections.allowFrom(props.renderQueue.backendConnections, Port.tcp(UsageBasedLicensing.LF_PORT));

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * This method grant access of worker fleet to ports that required
   *
   * @param workerFleet - worker fleet
   * @param licenses - UBL licenses
   */
  public grantPortAccess(workerFleet: IConnectable, licenses: UsageBasedLicense[]) {
    licenses.forEach(license => {
      license.ports.forEach(port => {
        workerFleet.connections.allowTo(this, port);
      });
    });
    workerFleet.connections.allowTo(this, Port.tcp(UsageBasedLicensing.LF_PORT));
  }

  /**
   * The connections object that allows you to control network egress/ingress to the License Forwarder.
   */
  public get connections() {
    return this.service.connections;
  }
}
