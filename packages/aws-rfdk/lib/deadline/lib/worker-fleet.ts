/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  AutoScalingGroup,
  BlockDevice,
  CfnAutoScalingGroup,
  HealthCheck,
  Signals,
} from '@aws-cdk/aws-autoscaling';
import {IMetric, Metric} from '@aws-cdk/aws-cloudwatch';
import {
  Connections,
  IConnectable,
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  IVpc,
  Port,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {IApplicationLoadBalancerTarget} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IGrantable,
  IPolicy,
  IPrincipal,
  IRole,
  Policy,
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Annotations,
  Construct,
  Duration,
  IResource,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';
import {
  HealthCheckConfig,
  HealthMonitor,
  IHealthMonitor,
  IMonitorableFleet,
  LogGroupFactoryProps,
  ScriptAsset,
} from '../../core';
import {
  tagConstruct,
} from '../../core/lib/runtime-info';
import {
  IRenderQueue,
} from './render-queue';
import { Version } from './version';
import {
  IInstanceUserDataProvider,
  WorkerInstanceConfiguration,
  WorkerSettings,
} from './worker-configuration';

/**
 * Interface for Deadline Worker Fleet.
 */
export interface IWorkerFleet extends IResource, IConnectable, IGrantable {
  /**
   * Allow access to the worker's remote command listener port (configured as a part of the
   * WorkerConfiguration) for an IConnectable that is either in this stack, or in a stack that
   * depends on this stack. If this stack depends on the other stack, use allowListenerPortTo().
   *
   * Common uses are:
   *
   *   Adding a SecurityGroup:
   *     `workerFleet.allowListenerPortFrom(securityGroup)`
   *
   *   Adding a CIDR:
   *     `workerFleet.allowListenerPortFrom(Peer.ipv4('10.0.0.0/24').connections)`
   */
  allowListenerPortFrom(other: IConnectable): void;

  /**
   * Allow access to the worker's remote command listener port (configured as a part of the
   * WorkerConfiguration) for an IConnectable that is either in this stack, or in a stack that this
   * stack depends on. If the other stack depends on this stack, use allowListenerPortFrom().
   *
   * Common uses are:
   *
   *   Adding a SecurityGroup:
   *     `workerFleet.allowListenerPortTo(securityGroup)`
   *
   *   Adding a CIDR:
   *     `workerFleet.allowListenerPortTo(Peer.ipv4('10.0.0.0/24').connections)`
   */
  allowListenerPortTo(other: IConnectable): void;
}

/**
 * Properties for the Deadline Worker Fleet.
 */
export interface WorkerInstanceFleetProps extends WorkerSettings {
  /**
   * VPC to launch the worker fleet in.
   */
  readonly vpc: IVpc;

  /**
   * Security Group to assign to this fleet.
   *
   * @default - create new security group
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * An IAM role to associate with the instance profile assigned to its resources.
   *
   * The role must be assumable by the service principal `ec2.amazonaws.com`:
   *
   *    const role = new iam.Role(this, 'MyRole', {
   *      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
   *    });
   *
   * @default - A role will automatically be created, it can be accessed via the `role` property
   */
  readonly role?: IRole;

  /**
   * AMI of the deadline worker to launch.
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * Type of instance to launch for executing repository installer.
   *
   * @default - a T2-Large type will be used.
   */
  readonly instanceType?: InstanceType;

  /**
   * Where to place the instance within the VPC.
   *
   * @default - Private subnets.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Name of SSH keypair to grant access to instance.
   *
   * @default - No SSH access will be possible.
   */
  readonly keyName?: string;

  /**
   * Initial amount of workers in the fleet.
   *
   * If this is set to a number, every deployment will reset the amount of
   * workers to this number. It is recommended to leave this value blank.
   *
   * @default minCapacity, and leave unchanged during deployment
   */
  readonly desiredCapacity?: number;

  /**
   * Minimum number of instances in the fleet.
   *
   * @default 1
   */
  readonly minCapacity?: number;

  /**
   * Maximum number of instances in the fleet.
   *
   * @default desiredCapacity, or minCapacity if desiredCapacity is not set
   */
  readonly maxCapacity?: number;

  /**
   * Endpoint for the RenderQueue, to which the worker fleet needs to be connected.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * Properties for setting up the Deadline Worker's LogGroup
   * @default - LogGroup will be created with all properties' default values and a prefix of "/renderfarm/".
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * Health Monitor component to monitor the health of instances.
   *
   * Note: The health-check feature is supported with Deadline Client v10.1.9 and later.
   *
   * @default - Health Monitoring is turned-off
   */
  readonly healthMonitor?: IHealthMonitor;

  /**
   * Properties for configuring a health check.
   *
   * Note: The health-check feature is supported with Deadline Client v10.1.9 and later.
   *
   * @default properties of HealthCheckConfig applies
   */
  readonly healthCheckConfig?: HealthCheckConfig;

  /**
   * The maximum hourly price($) to be paid for each Spot instance.
   * min - 0.001; max - 255
   *
   * @default - launches on-demand EC2 instances.
   */
  readonly spotPrice?: number;

  /*
   * The Block devices that will be attached to your workers.
   *
   * @default The default devices of the provided ami will be used.
   */
  readonly blockDevices?: BlockDevice[];

  /**
   * An optional provider of user data commands to be injected at various points during the Worker configuration lifecycle.
   * You can provide a subclass of InstanceUserDataProvider with the methods overridden as desired.
   */
  readonly userDataProvider?: IInstanceUserDataProvider;
}

/**
 *  A new or imported Deadline Worker Fleet.
 */
abstract class WorkerInstanceFleetBase extends Construct implements IWorkerFleet, IMonitorableFleet {

  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public abstract readonly connections: Connections;

  /**
   * The principal to grant permissions to.
   */
  public abstract readonly grantPrincipal: IPrincipal;

  /**
   * The stack in which this worker fleet is defined.
   */
  public abstract readonly stack: Stack;

  /**
   * The environment this resource belongs to.
   */
  public abstract readonly env: ResourceEnvironment;

  /**
   * The ASG object created by the construct.
   */
  public abstract readonly fleet: AutoScalingGroup;

  /**
   * This field expects the base capacity metric of the fleet against
   * which, the healthy percent will be calculated.
   *
   * eg.: GroupDesiredCapacity for an ASG
   */
  public abstract readonly targetCapacityMetric: IMetric;

  /**
   * This field expects the component of type INetworkLoadBalancerTarget
   * which can be attached to Network Load Balancer for monitoring.
   *
   * eg. An AutoScalingGroup
   */
  public abstract readonly targetToMonitor: IApplicationLoadBalancerTarget;

  /**
   * This field expects a policy which can be attached to the lambda
   * execution role so that it is capable of suspending the fleet.
   *
   * eg.: autoscaling:UpdateAutoScalingGroup permission for an ASG
   */
  public abstract readonly targetUpdatePolicy: IPolicy;

  /**
   * This field expects the maximum instance count this fleet can have.
   */
  public abstract readonly targetCapacity: number;

  /**
   * This field expects the scope in which to create the monitoring resource
   * like TargetGroups, Listener etc.
   */
  public abstract readonly targetScope: Construct;

  /**
   * @inheritdoc
   */
  public abstract allowListenerPortFrom(other: IConnectable): void;

  /**
   * @inheritdoc
   */
  public abstract allowListenerPortTo(other: IConnectable): void;
}

/**
 * This construct reperesents a fleet of Deadline Workers.
 *
 * The construct consists of an Auto Scaling Group (ASG) of instances using a provided AMI which has Deadline and any number
 * of render applications installed.  Whenever an instance in the ASG start it will connect Deadline to the desired render queue.
 *
 * When the worker fleet is deployed if it has been provided a HealthMonitor the Worker fleet will register itself against the Monitor
 * to ensure that the fleet remains healthy.
 *
 * Resources Deployed
 * ------------------------
 * - An EC2 Auto Scaling Group to maintain the number of instances.
 * - An Instance Role and corresponding IAM Policy.
 * - An Amazon CloudWatch log group that contains the Deadline Worker, Deadline Launcher, and instance-startup logs for the instances
 *   in the fleet.
 *
 * Security Considerations
 * ------------------------
 * - The instances deployed by this construct download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The data that is stored on your Worker's local EBS volume can include temporary working files from the applications
 *   that are rendering your jobs and tasks. That data can be sensitive or privileged, so we recommend that you encrypt
 *   the data volumes of these instances using either the provided option or by using an encrypted AMI as your source.
 * - The software on the AMI that is being used by this construct may pose a security risk. We recommend that you adopt a
 *   patching strategy to keep this software current with the latest security patches. Please see
 *   https://docs.aws.amazon.com/rfdk/latest/guide/patching-software.html for more information.
 */
export class WorkerInstanceFleet extends WorkerInstanceFleetBase {
  /**
   * The min limit for spot price.
   */
  public static readonly SPOT_PRICE_MIN_LIMIT = 0.001;

  /**
   * The max limit for spot price.
   */
  public static readonly SPOT_PRICE_MAX_LIMIT = 255;

  /**
   * This determines worker's health based on any hardware or software issues of EC2 instance.
   * Resource Tracker does deep ping every 5 minutes. These checks should be more frequent so
   * that any EC2 level issues are identified ASAP. Hence setting it to 1 minute.
   */
  private static readonly DEFAULT_HEALTH_CHECK_INTERVAL = Duration.minutes(1);

  /**
   * Default prefix for a LogGroup if one isn't provided in the props.
   */
  private static readonly DEFAULT_LOG_GROUP_PREFIX: string = '/renderfarm/';

  /**
   * This is the current maximum for number of workers that can be started on a single host. Currently the
   * only thing using this limit is the configuration of the listener ports. More than 8 workers can be started,
   * but only the first 8 will have their ports opened in the workers' security group.
   */
  private static readonly MAX_WORKERS_PER_HOST = 8;

  /**
   * Setting the default signal timeout to 15 min. This is the max time, a single instance is expected
   * to take for launch and execute the user-data for deadline worker configuration. As we are setting
   * failure signals in the user-data, any failure will terminate deployment immediately.
   */
  private static readonly RESOURCE_SIGNAL_TIMEOUT = Duration.minutes(15);

  /**
   * The ASG object created by the construct.
   */
  public readonly fleet: AutoScalingGroup;

  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public readonly connections: Connections;

  /**
   * The principal to grant permissions to.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * The stack in which this worker fleet is defined.
   */
  public readonly stack: Stack;

  /**
   * The environment this resource belongs to.
   */
  public readonly env: ResourceEnvironment;

  /**
   * The port workers listen on to share their logs.
   */
  public readonly listeningPorts: Port;

  /**
   * This field implements the base capacity metric of the fleet against
   * which, the healthy percent will be calculated.
   *
   * eg.: GroupDesiredCapacity for an ASG
   */
  public readonly targetCapacityMetric: IMetric;

  /**
   * This field implements the component of type INetworkLoadBalancerTarget
   * which can be attached to Network Load Balancer for monitoring.
   *
   * eg. An AutoScalingGroup
   */
  public readonly targetToMonitor: IApplicationLoadBalancerTarget;

  /**
   * This field implements a policy which can be attached to the lambda
   * execution role so that it is capable of suspending the fleet.
   *
   * eg.: autoscaling:UpdateAutoScalingGroup permission for an ASG
   */
  public readonly targetUpdatePolicy: IPolicy;

  /**
   * This field implements the maximum instance count this fleet can have.
   */
  public readonly targetCapacity: number;

  /**
   * This field implements the scope in which to create the monitoring resource
   * like TargetGroups, Listener etc.
   */
  public readonly targetScope: Construct;

  constructor(scope: Construct, id: string, props: WorkerInstanceFleetProps) {
    super(scope, id);
    this.stack = Stack.of(scope);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };

    this.validateProps(props);

    const minCapacity = props.minCapacity ?? 1;
    const signals = minCapacity > 0 ? Signals.waitForMinCapacity({
      timeout: WorkerInstanceFleet.RESOURCE_SIGNAL_TIMEOUT,
    }) : undefined;
    if (signals === undefined) {
      Annotations.of(this).addWarning('Deploying with 0 minimum capacity. If there is an error in the EC2 UserData for this fleet, then your stack deployment will not fail. Watch for errors in your CloudWatch logs.');
    }

    // Launching the fleet with deadline workers.
    this.fleet = new AutoScalingGroup(this, 'Default', {
      vpc: props.vpc,
      instanceType: (props.instanceType ? props.instanceType : InstanceType.of(InstanceClass.T2, InstanceSize.LARGE)),
      machineImage: props.workerMachineImage,
      keyName: props.keyName,
      vpcSubnets: props.vpcSubnets ? props.vpcSubnets : {
        subnetType: SubnetType.PRIVATE,
      },
      securityGroup: props.securityGroup,
      minCapacity,
      maxCapacity: props.maxCapacity,
      desiredCapacity: props.desiredCapacity,
      signals,
      healthCheck: HealthCheck.elb({
        grace: WorkerInstanceFleet.DEFAULT_HEALTH_CHECK_INTERVAL,
      }),
      role: props.role,
      spotPrice: props.spotPrice?.toString(),
      blockDevices: props.blockDevices,
    });

    this.targetCapacity = parseInt((this.fleet.node.defaultChild as CfnAutoScalingGroup).maxSize, 10);
    this.targetScope = this;
    this.targetToMonitor = this.fleet;
    this.targetCapacityMetric = new Metric({
      namespace: 'AWS/AutoScaling',
      metricName: 'GroupDesiredCapacity',
      dimensions: {
        AutoScalingGroupName: this.fleet.autoScalingGroupName,
      },
      label: 'GroupDesiredCapacity',
    });
    this.targetUpdatePolicy = new Policy(this, 'ASGUpdatePolicy', {
      statements: [new PolicyStatement({
        actions: ['autoscaling:UpdateAutoScalingGroup'],
        resources: [this.fleet.autoScalingGroupArn],
      })],
    });

    (this.fleet.node.defaultChild as CfnAutoScalingGroup).metricsCollection = [{
      granularity: '1Minute',
      metrics: ['GroupDesiredCapacity'],
    }];

    this.grantPrincipal = this.fleet.grantPrincipal;
    this.connections = this.fleet.connections;

    // Configure the health monitoring if provided.
    // Note: This must be done *BEFORE* configuring the worker. We rely on the worker configuration
    // script restarting the launcher.
    this.configureHealthMonitor(props);

    const workerConfig = new WorkerInstanceConfiguration(this, id, {
      worker: this.fleet,
      cloudWatchLogSettings: {
        logGroupPrefix: WorkerInstanceFleet.DEFAULT_LOG_GROUP_PREFIX,
        ...props.logGroupProps,
      },
      renderQueue: props.renderQueue,
      workerSettings: props,
      userDataProvider: props.userDataProvider,
    });
    this.listeningPorts = Port.tcpRange(
      workerConfig.listenerPort,
      workerConfig.listenerPort + WorkerInstanceFleet.MAX_WORKERS_PER_HOST,
    );

    // Updating the user data with successful cfn-signal commands.
    if (signals) {
      this.fleet.userData.addSignalOnExitCommand(this.fleet);
    }

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * Add the security group to all workers
   *
   * @param securityGroup: The security group to add
   */
  public addSecurityGroup(securityGroup: ISecurityGroup): void {
    this.fleet.addSecurityGroup(securityGroup);
  }

  /**
   * @inheritdoc
   */
  public allowListenerPortFrom(other: IConnectable): void {
    this.connections.allowFrom(other.connections, this.listeningPorts, 'Worker remote command listening port');
  }

  /**
   * @inheritdoc
   */
  public allowListenerPortTo(other: IConnectable): void {
    other.connections.allowTo(this.connections, this.listeningPorts, 'Worker remote command listening port');
  }

  private validateProps(props: WorkerInstanceFleetProps) {
    this.validateSpotPrice(props.spotPrice);
    this.validateArrayGroupsPoolsSyntax(props.groups, /^(?!none$)[a-zA-Z0-9-_]+$/i, 'groups');
    this.validateArrayGroupsPoolsSyntax(props.pools, /^(?!none$)[a-zA-Z0-9-_]+$/i, 'pools');
    this.validateRegion(props.region, /^(?!none$|all$|unrecognized$)[a-zA-Z0-9-_]+$/i);
    this.validateBlockDevices(props.blockDevices);
  }

  private validateSpotPrice(spotPrice: number | undefined) {
    if (spotPrice && !(spotPrice >= WorkerInstanceFleet.SPOT_PRICE_MIN_LIMIT && spotPrice <= WorkerInstanceFleet.SPOT_PRICE_MAX_LIMIT)) {
      throw new Error(`Invalid value: ${spotPrice} for property 'spotPrice'. Valid values can be any decimal between ${WorkerInstanceFleet.SPOT_PRICE_MIN_LIMIT} and ${WorkerInstanceFleet.SPOT_PRICE_MAX_LIMIT}.`);
    }
  }

  private validateRegion(region: string | undefined, regex: RegExp) {
    if (region && !regex.test(region)) {
      throw new Error(`Invalid value: ${region} for property 'region'. Valid characters are A-Z, a-z, 0-9, - and _. ‘All’, ‘none’ and ‘unrecognized’ are reserved names that cannot be used.`);
    }
  }

  private validateArrayGroupsPoolsSyntax(array: string[] | undefined, regex: RegExp, property: string) {
    if (array) {
      array.forEach(value => {
        if (!regex.test(value)) {
          throw new Error(`Invalid value: ${value} for property '${property}'. Valid characters are A-Z, a-z, 0-9, - and _. Also, group 'none' is reserved as the default group.`);
        }
      });
    }
  }

  private validateBlockDevices(blockDevices: BlockDevice[] | undefined) {
    if (blockDevices === undefined) {
      Annotations.of(this).addWarning(`The worker-fleet ${this.node.id} is being created without being provided any block devices so the Source AMI's devices will be used. ` +
        'Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');
    } else {
      blockDevices.forEach(device => {
        if (device.volume.ebsDevice === undefined) {
          // Suppressed or Ephemeral Block Device
          return;
        }

        // encrypted is not exposed as part of ebsDeviceProps so we need to confirm it exists then access it via [].
        // eslint-disable-next-line dot-notation
        if ( ('encrypted' in device.volume.ebsDevice === false) || ('encrypted' in device.volume.ebsDevice && !device.volume.ebsDevice['encrypted'] ) ) {
          Annotations.of(this).addWarning(`The BlockDevice "${device.deviceName}" on the worker-fleet ${this.node.id} is not encrypted. ` +
              'Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.');
        }
      });
    }
  }

  private configureHealthMonitor(props: WorkerInstanceFleetProps) {
    if (props.healthMonitor) {
      const healthCheckPort = props.healthCheckConfig?.port ?? HealthMonitor.DEFAULT_HEALTH_CHECK_PORT;

      const configureHealthMonitorScriptAsset = ScriptAsset.fromPathConvention(this, 'WorkerConfigurationScript', {
        osType: this.fleet.osType,
        baseName: 'configureWorkerHealthCheck',
        rootDir: path.join(
          __dirname,
          '..',
          'scripts/',
        ),
      });

      configureHealthMonitorScriptAsset.executeOn({
        host: this.fleet,
        args: [
          `'${healthCheckPort}'`,
          `'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}'`,
        ],
      });

      props.healthMonitor.registerFleet(this, props.healthCheckConfig || {
        port: healthCheckPort,
      });
    } else {
      Annotations.of(this).addWarning(`The worker-fleet ${this.node.id} is being created without a health monitor attached to it. This means that the fleet will not automatically scale-in to 0 if the workers are unhealthy.`);
    }
  }
}
