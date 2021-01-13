/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Connections,
  IConnectable,
  IMachineImage,
  //InstanceClass,
  //InstanceSize,
  InstanceType,
  ISecurityGroup,
  ISubnet,
  IVpc,
  Port,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  UserData,
} from '@aws-cdk/aws-ec2';
import {
  //IGrantable,
  //IPolicy,
  //IPrincipal,
  IRole,
  //Policy,
  //PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Construct,
  // Duration,
  IResource,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';
import {
  RFDK_VERSION,
  tagConstruct,
  TAG_NAME,
} from '../../core/lib/runtime-info';
// import { IWorkerFleet } from "./worker-fleet";

// TODO: this was taken from: export interface WorkerSettings
/**
 * Configuration settings for Deadline Workers
 */
export interface ISEPWorkerSettings {
  /**
   * Deadline groups these workers needs to be assigned to. The group is
   * created if it does not already exist.
   *
   * @default - Worker is not assigned to any group
   */
  readonly groups?: string[];

  /**
   * Deadline pools these workers needs to be assigned to. The pool is created
   * if it does not already exist.
   *
   * @default - Worker is not assigned to any pool.
   */
  readonly pools?: string[];

  /**
   * Deadline region these workers needs to be assigned to.
   *
   * @default - Worker is not assigned to any region
   */
  readonly region?: string;

  /**
   * The port to configure the worker to listen on for remote commands such as
   * requests for its log stream. If more than one worker is present on a single
   * host, connsecutive ports will be opened, starting with the supplied port,
   * up to the maximum number of workers defined by the WorkerInstanceFleet.
   *
   * @default 56032
   */
  readonly listenerPort?: number;
}

// --------------------------------------------------------------------------------------------------------------------------------------------ISEPLaunchSpecificationProperty
// TODO: Copied from https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.CfnSpotFleet.EbsBlockDeviceProperty.html
// TODO: Q1: Planned to use import { EbsDeviceProps } from '@aws-cdk/aws-autoscaling';, but it doesn't have `encrypted :(
// TODO: Q2: SHould we also use IResolvable here?

export interface IEbsDeviceProperties {
  readonly deleteOnTermination?: boolean;
  readonly encrypted?: boolean;
  readonly iops?: number;
  readonly snapshotId?: string;
  readonly volumeSize?: number;
  readonly volumeType?: string;
}

export interface IBlockDeviceMapping {
  readonly deviceName: string;
  readonly ebs?: IEbsDeviceProperties;
  readonly noDevice?: string; // TODO: do we need this?
  readonly virtualName?: string; // TODO: do we need this?
}

export interface ISpotPlacementProperty {
  readonly availabilityZone?: string;
  readonly groupName?: string;
  readonly tenancy?: string;
}

export interface ITag {
  readonly key: string;
  readonly value: string;
}

export interface ISpotFleetTagSpecificationProperty {
  readonly resourceType?: string;
  readonly tags?: ITag[];
}

export interface ISEPLaunchSpecificationProperty {
  /**
   * AMI of the deadline worker to launch.
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * Type of instance to launch.
   * TODO: implement default
   * @default - a T2-Large type will be used.
   */
  readonly instanceType?: InstanceType;

  /**
   * Where to place the instance within the VPC.
   * TODO: implement default
   * @default - Private subnets.
   */
  readonly subnet?: ISubnet;

  // TODO: should start with "DeadlineSpot" and have "AWSThinkboxDeadlineSpotEventPluginWorkerPolicy" attached. Make sure default is correct.
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
  readonly iamInstanceProfile?: IRole;

  /**
   * Name of SSH keypair to grant access to instance.
   * TODO: verify default
   * @default - No SSH access will be possible.
   */
  readonly keyName?: string;

  // TODO: we have only 1 security group for workerFleet, but allow multiple for SEP spot fleet
  /**
   * Security Groups to assign to this fleet.
   *
   * @default - create new security group
   */
  readonly securityGroups?: ISecurityGroup[];

  // TODO: if this is for each Spot instance, how does it work with the spot price for the whole fleet? Should we check min and max? Where do these values come from?
  /**
   * The maximum price per unit hour that you are willing to pay for a Spot Instance.
   *
   * @default - the Spot price specified for the fleet. To determine the Spot price per unit hour, divide the Spot price by the value of WeightedCapacity.
   */
  readonly spotPrice?: number;

  // TODO: Do we need this? Not in WorkerFleet.
  /**
   * The number of units provided by the specified instance type.
   * These are the same units that you chose to set the target capacity in terms of instances, or a performance characteristic such as vCPUs, memory, or I/O.
   * If the target capacity divided by this value is not a whole number, Amazon EC2 rounds the number of instances to the next whole number.
   *
   * @default - 1.
   */
  readonly weightedCapacity?: number;

  /**
   * The Base64-encoded user data that instances use when starting up.
   *
   * @default - No user data // TODO: Q? Should we create some userdata if not provided according to https://quip-amazon.com/5BQcAzVAmhPX/Spot-Event-Plugin-Configuration-Construct#ISf9CAiFR4E
   */
  readonly userData?: UserData;

  // TODO: what to do with this? Should we just use commented code below? What to do with encryption?
  readonly blockDeviceMappings?: IBlockDeviceMapping[];
  // /*
  //  * The Block devices that will be attached to your workers.
  //  *
  //  * @default The default devices of the provided ami will be used.
  //  */
  // readonly blockDevices?: BlockDevice[];

  // TODO: do we need this? Is it enough to add RFDK tags only?
  /**
   * TODO: add description
   *
   * @default -
   */
  readonly tagSpecifications?: ISpotFleetTagSpecificationProperty[];
}

// TODO: properties start with capital so they can be converted to string
export interface ISEPLaunchSpecificationBase {
  readonly ImageId: string;
  readonly BlockDeviceMappings?: IBlockDeviceMapping[];
  readonly IamInstanceProfileArn?: string; // TODO: is it correct to ask here for arn?
  readonly KeyName?: string;
  readonly SecurityGroupIds: string[]; // TODO: Can this be optional as well? why do we only have 1 security group for workerFleet?
  readonly SpotPrice?: string;
  readonly TagSpecifications?: ISpotFleetTagSpecificationProperty[]; // TODO: add tags
  readonly UserData?: string;
  readonly WeightedCapacity?: number;

//   // Not used?
//   readonly EbsOptimized?: boolean;
//   readonly KernelId?: string;
//   readonly MonitoringEnabled?: boolean; // TODO: decided just to use boolean instead of https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.CfnSpotFleet.SpotFleetMonitoringProperty.html
//   readonly NetworkInterfaces?: undefined; // TODO: we will not expose this property for now, until requested
//   readonly Placement?: ISpotPlacementProperty; // TODO: Is this important?
//   readonly RamdiskId?: string;
}

export interface ISEPLaunchSpecificationResult extends ISEPLaunchSpecificationBase {
  readonly InstanceType: string;
  readonly SubnetId?: string; // TODO: should this be optional?
}

// -------------------------------------------------------------------------------------------------------------------------------------ISEPSpotFleetRequestConfigDataProperty

// TODO: didn't find this enum in CDK. The closest is in aws-batch but it doesn't have the values we need
// https://github.com/aws/aws-cdk/blob/86e6c128eb42dfd4e2a44503d7c549a06b401434/packages/%40aws-cdk/aws-batch/lib/compute-environment.ts#L27
// Q? What if these value change in the future ?
export enum AllocationStrategy {
  /**
   * Spot Fleet launches instances from the Spot Instance pools with the lowest price.
   */
  LOWEST_PRICE = 'lowestPrice', // TODO: do we want to add this option here? In requierements we don't have it: https://quip-amazon.com/5BQcAzVAmhPX/Spot-Event-Plugin-Configuration-Construct#ISf9CA8bx2v
  /**
   * Spot Fleet launches instances from all the Spot Instance pools that you specify.
   */
  DIVERSIFIED = 'diversified',
  /**
   * Spot Fleet launches instances from Spot Instance pools with optimal capacity for the number of instances that are launching.
   */
  CAPACITY_OPTIMIZED = 'capacityOptimized',
}

export interface ISEPSpotFleetRequestConfigDataProperty extends ISEPWorkerSettings {
  /**
   * VPC to launch the worker fleet in.
   */
  readonly vpc: IVpc;

  // TODO: Is it created automatically by SEP if not provided? https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#iam-fleet-role
  /**
   * TODO: add description here and default
   *
   * @default -
   */
  readonly iamFleetRole?: IRole;

  // TODO: check targetCapacity of worker-fleet.ts.
  /**
   * The number of units to request for the Spot Fleet.
   * TODO: make sure default is correct
   * @default 1
   */
  readonly targetCapacity?: number;

  /**
   * Indicates how to allocate the target Spot Instance capacity across the Spot Instance pools specified by the Spot Fleet request.
   * // TODO: implement the default, otherwise it will default to lowestPrice
   * @default - CAPACITY_OPTIMIZED
   */
  readonly allocationStrategy?: AllocationStrategy;

  /**
   * The maximum price per unit hour that you are willing to pay for a Spot Instance.
   *
   * @default - launches on-demand EC2 instances.
   */
  readonly spotPrice?: number;

  /**
   * TODO: probably merge these properties. This was optional in the original Spot Fleet Request, but we make it required
   */
  readonly launchSpecificationOptions: ISEPLaunchSpecificationProperty;

  /**
   * Indicates whether running Spot Instances are terminated when the Spot Fleet request expires.
   * TODO: make sure default is correct
   * @default false
   */
  readonly terminateInstancesWithExpiration?: boolean;

  // TODO: we will create multiple launch specifications based on instance types and subnets.
  // This was an optional parameter in Spot Fleet Request but I made it required
  /**
   * Types of instances to launch.
   * TODO: at least 5 different Spot instance types (drawn from the M,C,R,I,F,Z instance classes)
   */
  readonly instanceTypes: InstanceType[]; // TODO: make it required?

  // TODO: is it ok to use here SubnetSelection or we should use ISubnet[] ? Is it ok to just use Private Subnets or we should better create a new subnet(problematic).
  /**
   * Where to place the instance within the VPC.
   *
   * @default - Private subnets.
   */
  readonly vpcSubnets?: SubnetSelection;

  // TODO: Need to implement getting time with Date.now(), endorcing correct format and calculating the end date.
  /**
   * The start date and time of the request, in UTC format (YYYY -MM -DD T*HH* :MM :SS Z).
   *
   * @default - Amazon EC2 starts fulfilling the request immediately.
   */
  readonly validFrom?: string;

  /**
   * The end date and time of the request, in UTC format (YYYY -MM -DD T*HH* :MM :SS Z).
   * After the end date and time, no new Spot Instance requests are placed or able to fulfill the request.
   *
   * @default - the Spot Fleet request remains until you cancel it.
   */
  readonly validUntil?: string;

  // // Not used?
  // readonly excessCapacityTerminationPolicy: string;
  // readonly instanceInterruptionBehavior?: string;
  // readonly instancePoolsToUseCount?: number; // TODO: only if AllocationStrategy is set to lowest-price
  // readonly loadBalancersConfig?: undefined; // TODO: we will not expose this property for now, until requested
  // readonly onDemandAllocationStrategy?: string; // TODO: we don't plan to use it, otherwise we can't use Launch Specifications, but have to use Launch Template
  // readonly onDemandMaxTotalPrice?: string; // TODO: we don't plan to use it, otherwise we can't use Launch Specifications, but have to use Launch Template
  // readonly onDemandTargetCapacity?: number; // TODO: we don't plan to use it, otherwise we can't use Launch Specifications, but have to use Launch Template
  // readonly replaceUnhealthyInstances?: boolean;
  // readonly spotMaintenanceStrategies?: undefined; // TODO: we will not expose this property for now, until requested
  // readonly type?: string; // TODO: should be always maintain for Deadline to work https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-requests

  // readonly spotMaxTotalPrice?: string; // TODO: maybe should be included?
}

export interface ISEPSpotFleetRequestConfigResult {
  readonly IamFleetRoleArn: string; // Do we need to create this? Is it created automatically by SEP? https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#iam-fleet-role

  // TODO: Should these options be required?
  readonly TargetCapacity: number;
  readonly AllocationStrategy?: string;
  readonly LaunchSpecifications?: ISEPLaunchSpecificationResult[];
  readonly SpotPrice?: string; // TODO: Q1: Not sure what's the difference between the one in LaunchSpecification or SpotMaxTotalPrice.

  readonly Type?: string; // TODO: should be always maintain for Deadline to work https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-requests

  readonly TerminateInstancesWithExpiration?: boolean;
  readonly ValidFrom?: string;
  readonly ValidUntil?: string;
}

// -------------------------------------------------------------------------------------------------------------------------------------SEP_SpotFleet

export interface ISEPWorkerFleet extends IResource, IConnectable { // TODO: IGrantable
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

abstract class SEPSpotFleetBase extends Construct implements ISEPWorkerFleet {
  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public abstract readonly connections: Connections;

  // TODO: How to implement this?
  // /**
  //  * The principal to grant permissions to.
  //  */
  // public abstract readonly grantPrincipal: IPrincipal;

  /**
   * The stack in which this worker fleet is defined.
   */
  public abstract readonly stack: Stack;

  /**
   * The environment this resource belongs to.
   */
  public abstract readonly env: ResourceEnvironment;

  // TODO: can we delete all the monitoring code?
  // // /**
  // //  * This field expects the base capacity metric of the fleet against
  // //  * which, the healthy percent will be calculated.
  // //  *
  // //  * eg.: GroupDesiredCapacity for an ASG
  // //  */
  // // public abstract readonly targetCapacityMetric: IMetric;

  // // /**
  // //  * This field expects the component of type INetworkLoadBalancerTarget
  // //  * which can be attached to Network Load Balancer for monitoring.
  // //  *
  // //  * eg. An AutoScalingGroup
  // //  */
  // // public abstract readonly targetToMonitor: IApplicationLoadBalancerTarget;

  // // /**
  // //  * This field expects a policy which can be attached to the lambda
  // //  * execution role so that it is capable of suspending the fleet.
  // //  *
  // //  * eg.: autoscaling:UpdateAutoScalingGroup permission for an ASG
  // //  */
  // // public abstract readonly targetUpdatePolicy: IPolicy;

  // /**
  //  * This field expects the maximum instance count this fleet can have.
  //  */
  // public abstract readonly targetCapacity: number;

  // // /**
  // //  * This field expects the scope in which to create the monitoring resource
  // //  * like TargetGroups, Listener etc.
  // //  */
  // // public abstract readonly targetScope: Construct;

  /**
   * @inheritdoc
   */
  public abstract allowListenerPortFrom(other: IConnectable): void;

  /**
   * @inheritdoc
   */
  public abstract allowListenerPortTo(other: IConnectable): void;
}

export class SEP_SpotFleet extends SEPSpotFleetBase {
  // TODO: copied from WorkerInstanceFleet. Should not be here.
  /**
   * This is the current maximum for number of workers that can be started on a single host. Currently the
   * only thing using this limit is the configuration of the listener ports. More than 8 workers can be started,
   * but only the first 8 will have their ports opened in the workers' security group.
   */
  private static readonly MAX_WORKERS_PER_HOST = 8;

  // TODO: copied from WorkerInstanceConfiguration. Should not be here.
  /**
   * The default port to use for a worker to listen on for remote commands.
   */
  private static readonly DEFAULT_LISTENER_PORT = 56032;

  /**
   * The security groups/rules used to allow network connections.
   */
  public readonly connections: Connections;

  // TODO: How to implement this?
  // /**
  //  * The principal to grant permissions to.
  //  */
  // public readonly grantPrincipal: IPrincipal;

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
   * TODO: used instead of connections, because we might have a few security groups.
   */
  public readonly securityGroups: ISecurityGroup[];
  public readonly vpcSubnets: SubnetSelection;

  private sfrProperties: ISEPSpotFleetRequestConfigResult | undefined;

  constructor(scope: Construct, id: string, props: ISEPSpotFleetRequestConfigDataProperty) {
    super(scope, id);

    this.stack = Stack.of(scope);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };

    // TODO: Q1? More parameters to add for a new SecurityGroup?
    // TODO: Q2? Is there a convention what to use or this.stack is ok?
    // TODO: Q2? Is there a way to use connections without security groups and vpc?
    this.securityGroups = props.launchSpecificationOptions.securityGroups ?? [ new SecurityGroup(this.stack, 'SEPConfigurationSecurityGroup', { vpc: props.vpc }) ];
    this.vpcSubnets = props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE };

    // this.grantPrincipal = undefined; // TODO: this.fleet.grantPrincipal;
    this.connections = new Connections({ securityGroups: this.securityGroups }); // TODO: is it ok to create a new Connections object?

    const listenerPort = props.listenerPort ?? SEP_SpotFleet.DEFAULT_LISTENER_PORT;
    this.listeningPorts = Port.tcpRange(
      listenerPort,
      listenerPort + SEP_SpotFleet.MAX_WORKERS_PER_HOST,
    );

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);

    this.generate(props);
  }

  /**
   * TODO: add description
   */
  private generate(props: ISEPSpotFleetRequestConfigDataProperty) {
    const className = this.constructor.name;
    const value = `${RFDK_VERSION}:${className}`;

    const rfdkTag: ISpotFleetTagSpecificationProperty = {
      resourceType: 'instance',
      tags: [
        {
          key: TAG_NAME,
          value: value,
        },
      ],
    };

    const sgIds = this.securityGroups.map(securityGroup => {
      return securityGroup.securityGroupId;
    });

    const sharedLaunchSpecification: ISEPLaunchSpecificationBase = {
      ImageId: props.launchSpecificationOptions.workerMachineImage.getImage(this).imageId, // TODO: what does getImage(this) do? Can we use it here?
      SecurityGroupIds: sgIds,
      TagSpecifications: [
        rfdkTag,
      ],
    };

    let launchSpecifications: ISEPLaunchSpecificationResult[] = [];

    props.instanceTypes.map(instanceType => {
      this.vpcSubnets.subnets!.map(subnet => { // TODO: used ! here as I don't expect subnets to be empty. Is this correct?
        const launchSpecificationResult: ISEPLaunchSpecificationResult = {
          ...sharedLaunchSpecification,
          InstanceType: instanceType.toString(),
          SubnetId: subnet.subnetId,
        };
        return launchSpecifications.push(launchSpecificationResult);
      });
    });

    this.sfrProperties = {
      IamFleetRoleArn: props.iamFleetRole?.roleArn ?? '', // TODO: create a role
      LaunchSpecifications: launchSpecifications,
      TargetCapacity: props.targetCapacity ?? 1, // TODO: default value for targetCapacity?
    };
  }

  // TODO: make sure that it can't be empty and is always valid
  /**
   * TODO: add description
   */
  public getRequestConfig(): string {
    return JSON.stringify(this.sfrProperties);
  }

  /**
   * @inheritdoc
   */
  public allowListenerPortFrom(other: IConnectable): void {
    // TODO: remove this once confirmed that it works
    // this.securityGroups.map(securityGroup => {
    //   securityGroup.connections.allowFrom(other.connections, this.listeningPorts, 'Worker remote command listening port');
    // });
    this.connections.allowFrom(other.connections, this.listeningPorts, 'Worker remote command listening port');
  }

  /**
   * @inheritdoc
   */
  public allowListenerPortTo(other: IConnectable): void {
    other.connections.allowTo(this.connections, this.listeningPorts, 'Worker remote command listening port');
  }
}