/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AutoScalingGroup,
  BlockDeviceVolume,
} from '@aws-cdk/aws-autoscaling';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Port,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Cluster,
  Compatibility,
  ContainerImage,
  Ec2Service,
  LogDriver,
  NetworkMode,
  PlacementConstraint,
  TaskDefinition,
  UlimitName,
} from '@aws-cdk/aws-ecs';
import {
  IGrantable,
  IPrincipal,
} from '@aws-cdk/aws-iam';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
} from '@aws-cdk/core';
import {
  LogGroupFactory,
  LogGroupFactoryProps,
} from '../../core';
import {IRenderQueue} from './render-queue';
import {IWorkerFleet} from './worker-fleet';

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
    return new UsageBasedLicense('max', [Port.tcp(27002)], limit);
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
    return new UsageBasedLicense('arnold', [Port.tcp(5056), Port.tcp(7056)], limit);
  }

  /**
   * Method for Cinema 4D license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forCinema4D(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('cinema4d', [Port.tcp(5057), Port.tcp(7057)], limit);
  }

  /**
   * Method for Clarisse license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forClarisse(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('clarisse', [Port.tcp(40500)], limit);
  }

  /**
   * Method for Houdini license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forHoudini(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('houdini', [Port.tcp(1715)], limit);
  }

  /**
   * Method for Katana license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKatana(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('katana', [Port.tcp(4101), Port.tcp(6101)], limit);
  }

  /**
   * Method for KeyShot license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKeyShot(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('keyshot', [Port.tcp(27003), Port.tcp(2703)], limit);
  }

  /**
   * Method for krakatoa license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forKrakatoa(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('krakatoa', [Port.tcp(27000), Port.tcp(2700)], limit);
  }

  /**
   * Method for Mantra license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forMantra(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('mantra', [Port.tcp(1716)], limit);
  }

  /**
   * Method for maxwell license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forMaxwell(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('maxwell', [Port.tcp(5055), Port.tcp(7055)], limit);
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
    return new UsageBasedLicense('maya', [Port.tcp(27002), Port.tcp(2702)], limit);
  }

  /**
   * Method for Nuke license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forNuke(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('nuke', [Port.tcp(4101), Port.tcp(6101)], limit);
  }

  /**
   * Method for RealFlow license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forRealFlow(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('realflow', [Port.tcp(5055), Port.tcp(7055)], limit);
  }

  /**
   * Method for RedShift license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forRedShift(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('redshift', [Port.tcp(5054), Port.tcp(7054)], limit);
  }

  /**
   * Method for V-Ray license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forVray(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('vray', [Port.tcp(30306)], limit);
  }

  /**
   * Method for Yeti license limit
   *
   * @param limit - The maximum number of rendering tasks that can have this UBL license checked out at the same time.
   *
   * @default - limit will be set to unlimited
   */
  public static forYeti(limit?: number): UsageBasedLicense {
    return new UsageBasedLicense('yeti', [Port.tcp(5053), Port.tcp(7053)], limit);
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

  constructor(licenseName: string, ports: Port[], limit?: number) {
    this.licenseName = licenseName;
    this.ports = ports;
    this.limit = limit;
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
   * The amount (in MiB) of memory to present to the License Forwarder container.
   *
   * If your container attempts to exceed the allocated memory, the container
   * is terminated.
   *
   * At least one of memoryLimitMiB and memoryReservationMiB is required for non-Fargate services.
   *
   * @default - No memory limit.
   */
  readonly memoryLimitMiB?: number;

  /**
   * The soft limit (in MiB) of memory to reserve for the License Forwarder container.
   *
   * When system memory is under heavy contention, Docker attempts to keep the
   * container memory to this soft limit. However, your container can consume more
   * memory when it needs to, up to either the hard limit specified with the memory
   * parameter (if applicable), or all of the available memory on the container
   * instance, whichever comes first.
   *
   * At least one of memoryLimitMiB and memoryReservationMiB is required for non-Fargate services.
   *
   * @default - No memory reserved.
   */
  readonly memoryReservationMiB?: number;

  /**
   * Properties for setting up the Deadline License Forwarder's LogGroup in CloudWatch
   * @default - LogGroup will be created with all properties' default values to the LogGroup: /renderfarm/<construct id>
   */
  readonly logGroupProps?: LogGroupFactoryProps;
}

/**
 * This construct is an implementation of the Deadline component that is required for Usage-based Licensing (UBL)
 * (see: https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/licensing-usage-based.html )
 * in a render farm.
 *
 * Internally this is implemented as one or more instances of the Deadline License Forwarder application set up
 * to communicate to the render queue and Thinkbox’s licensing system, and to allow ingress connections
 * from the worker nodes so that they can acquire licenses as needed.
 *
 * The Deadline License Forwarder is set up to run within an AWS ECS task.
 *
 * Access to the running License Forwarder is gated by a security group that, by default, allows no ingress;
 * when a Deadline Worker requires access to licensing, then the RFDK constructs will grant that worker’s security group
 * ingress on TCP port 17004 as well as other ports as required by the specific licenses being used.
 *
 * Note: This construct does not currently implement the Deadline License Forwarder's Web Forwarding functionality.
 * This construct is not usable in any China region.
 *
 * @ResourcesDeployed
 * 1) The Auto Scaling Group (ASG) added to the Amazon ECS cluster that is hosting the Deadline License Forwarder for UBL.
 *    By default, creates one instance. The default instance type is C5 Large.
 * 2) Elastic Block Store device(s) associated with the EC2 instance(s) in the ASG. The default volume size is 30 GiB.
 * 3) The LogGroup if it doesn't exist already.
 *
 * @ResidualRisk
 * - Any machine that has ingress network access to the License Forwarder is able to receive the licenses.
 *   Make sure the security group of the license forwarder is tightly restricted
 *   to allow only ingress from the machines that require it
 * - Docker container has permissions to read a secret with 3rd Party Licensing Certificates
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
  public cluster: Cluster;

  /**
   * Autoscaling group for license forwarder instances
   */
  public asg: AutoScalingGroup;

  /**
   * The principal to grant permissions to.
   */
  public readonly grantPrincipal: IPrincipal;

  private readonly service: Ec2Service;

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

    this.asg = this.cluster.addCapacity('ClusterCapacity', {
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      instanceType: props.instanceType ? props.instanceType : InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
      minCapacity: props.desiredCount ?? 1,
      maxCapacity: props.desiredCount ?? 1,
      blockDevices: [ {
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs( 30, {encrypted: true}),
      }],
    });

    const taskDefinition = new TaskDefinition(this, 'TaskDef', {
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

    const prefix = props.logGroupProps?.logGroupPrefix ? props.logGroupProps.logGroupPrefix : UsageBasedLicensing.DEFAULT_LOG_GROUP_PREFIX;
    const defaultedLogGroupProps: LogGroupFactoryProps = {
      ...props.logGroupProps,
      logGroupPrefix: prefix,
    };
    const logGroup = LogGroupFactory.createOrFetch(this, 'LogGroupWrapper', `${id}`, defaultedLogGroupProps);
    logGroup.grantWrite(this.asg);

    const container = taskDefinition.addContainer('Container', {
      image: props.images.licenseForwarder,
      environment: containerEnv,
      memoryLimitMiB: props.memoryLimitMiB,
      memoryReservationMiB: props.memoryReservationMiB,
      logging: LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'docker',
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
      desiredCount: props.desiredCount,
      placementConstraints: [PlacementConstraint.distinctInstances()],
    });

    this.node.defaultChild = this.service;
    this.connections.allowToDefaultPort(props.renderQueue);
  }

  /**
   * This method grant access of worker fleet to ports that required
   *
   * @param workerFleet - worker fleet
   * @param licenses - UBL licenses
   */
  public grantPortAccess(workerFleet: IWorkerFleet, licenses: UsageBasedLicense[]) {
    licenses.forEach(license => {
      license.ports.forEach(port => {
        this.connections.allowFrom(workerFleet, port);
      });
    });
    this.connections.allowFrom(workerFleet, Port.tcp(UsageBasedLicensing.LF_PORT));
  }

  /**
   * The connections object that allows you to control network egress/ingress to the Licence Forwarder.
   */
  public get connections() {
    return this.service.connections;
  }
}