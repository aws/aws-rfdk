/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BlockDevice,
} from '@aws-cdk/aws-autoscaling';
import {
  Connections,
  IConnectable,
  IMachineImage,
  InstanceType,
  ISecurityGroup,
  IVpc,
  OperatingSystemType,
  Port,
  SecurityGroup,
  SelectedSubnets,
  SubnetSelection,
  UserData,
} from '@aws-cdk/aws-ec2';
import {
  CfnInstanceProfile,
  IGrantable,
  IPrincipal,
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  Annotations,
  Construct,
  Expiration,
  Stack,
  TagManager,
  TagType,
} from '@aws-cdk/core';
import {
  IScriptHost,
  LogGroupFactoryProps,
} from '../../core';
import {
  tagConstruct,
} from '../../core/lib/runtime-info';
import {
  IRenderQueue,
} from './render-queue';
import {
  SpotFleetAllocationStrategy,
} from './spot-event-plugin-fleet-ref';
import {
  IInstanceUserDataProvider,
  WorkerInstanceConfiguration,
} from './worker-configuration';

/**
 * Properties for the Spot Event Plugin Worker Fleet.
 */
export interface SpotEventPluginFleetProps {
  /**
   * VPC to launch the Worker fleet in.
   */
  readonly vpc: IVpc;

  /**
   * The RenderQueue that Worker fleet should connect to.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * The AMI of the Deadline Worker to launch.
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * The  the maximum capacity that the Spot Fleet can grow to.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-requests
   */
  readonly maxCapacity: number;

  /**
   * Types of instances to launch.
   */
  readonly instanceTypes: InstanceType[];

  /**
   * Deadline groups these workers need to be assigned to.
   * Note that the Spot Fleet configuration does not allow using wildcards as part of the Group name
   * as described here https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#wildcards
   *
   * @default - Workers are not assigned to any group
   */
  readonly deadlineGroups: string[];

  /**
   * Deadline pools these workers need to be assigned to.
   *
   * @default - Workers are not assigned to any pool.
   */
  readonly deadlinePools?: string[];

  /**
   * Deadline region these workers needs to be assigned to.
   * Note that this is not an AWS region but a Deadline region used for path mapping.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/cross-platform.html#regions
   *
   * @default - Worker is not assigned to any Deadline region.
   */
  readonly deadlineRegion?: string;

  /**
   * An IAM role for the spot fleet.
   *
   * The role must be assumable by the service principal `spotfleet.amazonaws.com`
   * and have AmazonEC2SpotFleetTaggingRole policy attached
   *
   * ```ts
   * const role = new iam.Role(this, 'FleetRole', {
   *   assumedBy: new iam.ServicePrincipal('spotfleet.amazonaws.com'),
   *   managedPolicies: [
   *     ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
   *   ],
   * });
   * ```
   *
   * @default - A role will automatically be created.
   */
  readonly fleetRole?: IRole;

  /**
   * An IAM role to associate with the instance profile assigned to its resources.
   *
   * The role must be assumable by the service principal `ec2.amazonaws.com` and
   * have AWSThinkboxDeadlineSpotEventPluginWorkerPolicy policy attached:
   *
   * ```ts
   * const role = new iam.Role(this, 'MyRole', {
   *   assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
   *   managedPolicies: [
   *     ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
   *   ],
   * });
   * ```
   *
   * @default - A role will automatically be created.
   */
  readonly fleetInstanceRole?: IRole;

  /**
   * Name of SSH keypair to grant access to instances.
   *
   * @default - No SSH access will be possible.
   */
  readonly keyName?: string;

  /**
   * Security Groups to assign to this fleet.
   *
   * @default - A new security group will be created automatically.
   */
  readonly securityGroups?: ISecurityGroup[];

  /**
   * User data that instances use when starting up.
   *
   * @default - User data will be created automatically.
   */
  readonly userData?: UserData;

  /**
   * The Block devices that will be attached to your workers.
   *
   * @default - The default devices of the provided ami will be used.
   */
  readonly blockDevices?: BlockDevice[];

  /**
   * Indicates how to allocate the target Spot Instance capacity
   * across the Spot Instance pools specified by the Spot Fleet request.
   *
   * @default - SpotFleetAllocationStrategy.LOWEST_PRICE.
   */
  readonly allocationStrategy?: SpotFleetAllocationStrategy;

  /**
   * Where to place the instance within the VPC.
   *
   * @default - Private subnets.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The end date and time of the request.
   * After the end date and time, no new Spot Instance requests are placed or able to fulfill the request.
   *
   * @default - the Spot Fleet request remains until you cancel it.
   */
  readonly validUntil?: Expiration;

  /**
   * Properties for setting up the Deadline Worker's LogGroup
   * @default - LogGroup will be created with all properties' default values and a prefix of "/renderfarm/".
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * An optional provider of user data commands to be injected at various points during the Worker configuration lifecycle.
   * You can provide a subclass of InstanceUserDataProvider with the methods overridden as desired.
   *
   * @default: Not used.
   */
  readonly userDataProvider?: IInstanceUserDataProvider;
}

/**
 * Interface for Spot Event Plugin Worker Fleet.
 */
export interface ISpotEventPluginFleet extends IConnectable, IScriptHost, IGrantable {
  /**
   * Allow access to the Worker's remote command listener port (configured as a part of the
   * WorkerConfiguration) for an IConnectable that is either in this stack, or in a stack that
   * depends on this stack. If this stack depends on the other stack, use allowRemoteControlTo().
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/remote-control.html
   *
   * Common uses are:
   *
   *   Adding a SecurityGroup:
   *     `workerFleet.allowRemoteControlFrom(securityGroup)`
   *
   *   Adding a CIDR:
   *     `workerFleet.allowRemoteControlFrom(Peer.ipv4('10.0.0.0/24'))`
   */
  allowRemoteControlFrom(other: IConnectable): void;

  /**
   * Allow access to the Worker's remote command listener port (configured as a part of the
   * WorkerConfiguration) for an IConnectable that is either in this stack, or in a stack that this
   * stack depends on. If the other stack depends on this stack, use allowRemoteControlFrom().
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/remote-control.html
   *
   * Common uses are:
   *
   *   Adding a SecurityGroup:
   *     `workerFleet.allowRemoteControlTo(securityGroup)`
   *
   *   Adding a CIDR:
   *     `workerFleet.allowRemoteControlTo(Peer.ipv4('10.0.0.0/24'))`
   */
  allowRemoteControlTo(other: IConnectable): void;
}

/**
 * This construct reperesents a fleet from the Spot Fleet Request created by the Spot Event Plugin.
 * This fleet is intended to be used as input for the {@link @aws-rfdk/deadline#ConfigureSpotEventPlugin} construct.
 *
 * The construct itself doesn't create the Spot Fleet Request, but it deployes all the resources
 * required for the Spot Fleet Request and generates the Spot Fleet Configuration setting:
 * a one to one mapping between a Deadline Group and Spot Fleet Request Configurations.
 *
 * Resources Deployed
 * ------------------------
 * - An Instance Role, corresponding IAM Policy and an Instance Profile.
 * - A Fleet Role and corresponding IAM Policy.
 * - An Amazon CloudWatch log group that contains the Deadline Worker, Deadline Launcher, and instance-startup logs for the instances
 *   in the fleet.
 * - A security Group if security groups are not provided.
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
export class SpotEventPluginFleet extends Construct implements ISpotEventPluginFleet {
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
   * The security groups/rules used to allow network connections.
   */
  public readonly connections: Connections;

  /**
   * The principal to grant permissions to. Granting permissions to this principal will grant
   * those permissions to the spot instance role.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * The port workers listen on to share their logs.
   */
  public readonly remoteControlPorts: Port;

  /**
   * Security Groups assigned to this fleet.
   */
  public readonly securityGroups: ISecurityGroup[];

  /**
   * The user data that instances use when starting up.
   */
  public readonly userData: UserData;

  /**
   * The operating system of the script host.
   */
  public readonly osType: OperatingSystemType;

  /**
   * An IAM role associated with the instance profile assigned to its resources.
   */
  public readonly fleetInstanceRole: IRole;

  /**
   * The IAM instance profile that fleet instance role is associated to.
   */
  public readonly instanceProfile: CfnInstanceProfile;

  /**
   * An IAM role that grants the Spot Fleet the permission to request, launch, terminate, and tag instances on your behalf.
   */
  public readonly fleetRole: IRole;

  /**
   * An id of the Worker AMI.
   */
  public readonly imageId: string;

  /**
   * The tags to apply during creation of instances and of the Spot Fleet Request.
   */
  public readonly tags: TagManager;

  /**
   * Subnets where the instance will be placed within the VPC.
   */
  public readonly subnets: SelectedSubnets;

  /**
   * Types of instances to launch.
   */
  public readonly instanceTypes: InstanceType[];

  /**
   * Indicates how to allocate the target Spot Instance capacity
   * across the Spot Instance pools specified by the Spot Fleet request.
   */
  public readonly allocationStrategy: SpotFleetAllocationStrategy;

  /**
   * The  the maximum capacity that the Spot Fleet can grow to.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#spot-fleet-requests
   */
  public readonly maxCapacity: number;

  /**
   * Deadline groups the workers need to be assigned to.
   *
   * @default - Workers are not assigned to any group
   */
  readonly deadlineGroups: string[];

  /**
   * Name of SSH keypair to grant access to instances.
   *
   * @default - No SSH access will be possible.
   */
  public readonly keyName?: string;

  /**
   * The end date and time of the request.
   * After the end date and time, no new Spot Instance requests are placed or able to fulfill the request.
   *
   * @default - the Spot Fleet request remains until you cancel it.
   */
  readonly validUntil?: Expiration;

  /**
   * The Block devices that will be attached to your workers.
   *
   * @default - The default devices of the provided ami will be used.
   */
  public readonly blockDevices?: BlockDevice[];

  constructor(scope: Construct, id: string, props: SpotEventPluginFleetProps) {
    super(scope, id);

    this.validateProps(props);

    this.securityGroups = props.securityGroups ?? [ new SecurityGroup(this, 'SpotFleetSecurityGroup', { vpc: props.vpc }) ];
    this.connections = new Connections({ securityGroups: this.securityGroups });
    this.connections.allowToDefaultPort(props.renderQueue.endpoint);

    this.fleetInstanceRole = props.fleetInstanceRole ?? new Role(this, 'SpotFleetInstanceRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
      ],
      description: `Spot Fleet instance role for ${id} in region ${Stack.of(scope).region}`,
    });

    this.instanceProfile = new CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [this.fleetInstanceRole.roleName],
    });

    this.grantPrincipal = this.fleetInstanceRole;

    this.fleetRole = props.fleetRole ?? new Role(this, 'SpotFleetRole', {
      assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
      ],
      description: `Spot Fleet role for ${id} in region ${Stack.of(scope).region}`,
    });

    this.blockDevices = props.blockDevices;
    this.subnets = props.vpc.selectSubnets(props.vpcSubnets);
    this.instanceTypes = props.instanceTypes;
    this.allocationStrategy = props.allocationStrategy ?? SpotFleetAllocationStrategy.LOWEST_PRICE;
    this.maxCapacity = props.maxCapacity;
    this.validUntil = props.validUntil;
    this.keyName = props.keyName;
    this.deadlineGroups = props.deadlineGroups;

    const imageConfig = props.workerMachineImage.getImage(this);
    this.osType = imageConfig.osType;
    this.userData = props.userData ?? imageConfig.userData;
    this.imageId = imageConfig.imageId;

    const workerConfig = new WorkerInstanceConfiguration(this, id, {
      worker: this,
      cloudwatchLogSettings: {
        logGroupPrefix: SpotEventPluginFleet.DEFAULT_LOG_GROUP_PREFIX,
        ...props.logGroupProps,
      },
      renderQueue: props.renderQueue,
      workerSettings: {
        groups: props.deadlineGroups,
        pools: props.deadlinePools,
        region: props.deadlineRegion,
      },
      userDataProvider: props.userDataProvider,
    });

    this.remoteControlPorts = Port.tcpRange(
      workerConfig.listenerPort,
      workerConfig.listenerPort + SpotEventPluginFleet.MAX_WORKERS_PER_HOST,
    );

    this.tags = new TagManager(TagType.KEY_VALUE, 'RFDK::SpotEventPluginFleet');

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * @inheritdoc
   */
  public allowRemoteControlFrom(other: IConnectable): void {
    this.connections.allowFrom(other.connections, this.remoteControlPorts, 'Worker remote command listening port');
  }

  /**
   * @inheritdoc
   */
  public allowRemoteControlTo(other: IConnectable): void {
    other.connections.allowTo(this.connections, this.remoteControlPorts, 'Worker remote command listening port');
  }

  private validateProps(props: SpotEventPluginFleetProps): void {
    this.validateInstanceTypes(props.instanceTypes);
    this.validateSubnets(props.vpc, props.vpcSubnets);
    this.validateGroups('deadlineGroups', props.deadlineGroups);
    this.validateRegion('deadlineRegion', props.deadlineRegion);
    this.validateBlockDevices(props.blockDevices);
  }

  private validateInstanceTypes(array: InstanceType[]): void {
    if (array.length === 0) {
      throw new Error('At least one instance type is required for a Spot Fleet Request Configuration');
    }
  }

  private validateSubnets(vpc: IVpc, vpcSubnets?: SubnetSelection) {
    const { subnets } = vpc.selectSubnets(vpcSubnets);
    if (subnets.length === 0) {
      Annotations.of(this).addError(`Did not find any subnets matching '${JSON.stringify(vpcSubnets)}', please use a different selection.`);
    }
  }

  private validateGroups(property: string, array: string[]): void {
    const regex: RegExp = /^(?!none$)[a-zA-Z0-9-_]+$/i;
    if (array.length === 0) {
      throw new Error('At least one Deadline Group is required for a Spot Fleet Request Configuration');
    }
    array.forEach(value => {
      if (!regex.test(value)) {
        throw new Error(`Invalid value: ${value} for property '${property}'. Valid characters are A-Z, a-z, 0-9, - and _. Also, group 'none' is reserved as the default group.`);
      }
    });
  }

  private validateRegion(property: string, region?: string): void {
    const regex: RegExp = /^(?!none$|all$|unrecognized$)[a-zA-Z0-9-_]+$/i;
    if (region && !regex.test(region)) {
      throw new Error(`Invalid value: ${region} for property '${property}'. Valid characters are A-Z, a-z, 0-9, - and _. ‘All’, ‘none’ and ‘unrecognized’ are reserved names that cannot be used.`);
    }
  }

  private validateBlockDevices(blockDevices?: BlockDevice[]): void {
    if (blockDevices === undefined) {
      Annotations.of(this).addWarning(`The spot-fleet ${this.node.id} is being created without being provided any block devices so the Source AMI's devices will be used. ` +
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
          Annotations.of(this).addWarning(`The BlockDevice "${device.deviceName}" on the spot-fleet ${this.node.id} is not encrypted. ` +
              'Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.');
        }
      });
    }
  }
}
