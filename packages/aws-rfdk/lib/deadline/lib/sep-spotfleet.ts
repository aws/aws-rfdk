/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import {
  BlockDevice,
  BlockDeviceVolume,
  CfnLaunchConfiguration,
  EbsDeviceVolumeType,
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
  Fn,
  Expiration,
  IResolvable,
  IResource,
  Lazy,
  Names,
  ResourceEnvironment,
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
// import {
//   SpotFleetAllocationStrategy,
//   SpotFleetRequestType,
//   SpotFleetResourceType,
//   SpotFleetRequestLaunchSpecification,
//   SpotFleetRequestProps,
//   TagSpecification,
// } from './spot-event-plugin-fleet-ref';
import {
  IInstanceUserDataProvider,
  WorkerInstanceConfiguration,
} from './worker-configuration';

/**
 * The allocation strategy for the Spot Instances in your Spot Fleet
 * determines how it fulfills your Spot Fleet request from the possible
 * Spot Instance pools represented by its launch specifications.
 * See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-fleet-configuration-strategies.html#ec2-fleet-allocation-strategy
 */
export enum SpotFleetAllocationStrategy {
  /**
   * Spot Fleet launches instances from the Spot Instance pools with the lowest price.
   */
  LOWEST_PRICE = 'lowestPrice',
  /**
   * Spot Fleet launches instances from all the Spot Instance pools that you specify.
   */
  DIVERSIFIED = 'diversified',
  /**
   * Spot Fleet launches instances from Spot Instance pools with optimal capacity for the number of instances that are launching.
   */
  CAPACITY_OPTIMIZED = 'capacityOptimized',
}

/**
 * Resource types that presently support tag on create.
 */
enum SpotFleetResourceType {
  /**
   * EC2 Instances.
   */
  INSTANCE = 'instance',

  /**
   * Spot fleet requests.
   */
  SPOT_FLEET_REQUEST = 'spot-fleet-request',
}

/**
 * The type of request. Indicates whether the Spot Fleet only requests the target capacity or also attempts to maintain it.
 * Only 'maintain' is currently supported.
 */
enum SpotFleetRequestType {
  /**
   * The Spot Fleet maintains the target capacity.
   * The Spot Fleet places the required requests to meet capacity and automatically replenishes any interrupted instances.
   */
  MAINTAIN = 'maintain',
}

interface InstanceProfile {
  readonly Arn: string;
}

interface SecurityGroupId {
  readonly GroupId: string;
}

interface TagSpecification {
  readonly ResourceType: SpotFleetResourceType;
  readonly Tags: any;
}

interface SpotFleetRequestLaunchSpecification
{
  readonly BlockDeviceMappings?: CfnLaunchConfiguration.BlockDeviceMappingProperty[];
  readonly IamInstanceProfile: InstanceProfile;
  readonly ImageId: string;
  readonly SecurityGroups: IResolvable | SecurityGroupId[];
  readonly SubnetId?: string;
  readonly TagSpecifications: IResolvable | TagSpecification[];
  readonly UserData: string;
  readonly InstanceType: string;
  readonly KeyName?: string;
}

interface SpotFleetRequestProps {
  readonly AllocationStrategy: SpotFleetAllocationStrategy;
  readonly IamFleetRole: string;
  readonly LaunchSpecifications: SpotFleetRequestLaunchSpecification[];
  readonly ReplaceUnhealthyInstances: boolean;
  readonly TargetCapacity: number;
  readonly TerminateInstancesWithExpiration: boolean;
  readonly Type: SpotFleetRequestType;
  readonly TagSpecifications: IResolvable | TagSpecification[];
  readonly ValidUntil?: string;
}

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
   * AMI of the Deadline Worker to launch.
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * The number of units to request for the Spot Fleet.
   *
   */
  readonly targetCapacity: number;

  /**
   * Types of instances to launch.
   */
  readonly instanceTypes: InstanceType[];

  /**
   * Deadline groups these workers need to be assigned to.
   * Note that the Spot Fleet configuration allows for the use of wildcards as part of the Group name.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#wildcards
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
   */
  readonly fleetRole?: IRole;

  /**
   * Deadline region these workers needs to be assigned to.
   * Note that this is not an AWS region but a Deadline region used for path mapping.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/cross-platform.html#regions
   *
   * @default - Worker is not assigned to any Deadline region.
   */
  readonly deadlineRegion?: string;

  /**
   * An IAM role to associate with the instance profile assigned to its resources.
   *
   * The role must be assumable by the service principal `ec2.amazonaws.com`,
   * have AWSThinkboxDeadlineSpotEventPluginWorkerPolicy policy attached and
   * the role name must begin with "DeadlineSpot":
   *
   * ```ts
   * const role = new iam.Role(this, 'MyRole', {
   *   assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
   *   managedPolicies: [
   *     ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
   *   ],
   *   roleName: 'DeadlineSpot' + ...,
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
   * Indicates whether Spot Fleet should replace unhealthy instances.
   *
   * @default true
   */
  readonly replaceUnhealthyInstances?: boolean;

  /**
   * Indicates whether running Spot Instances are terminated when the Spot Fleet request expires.
   *
   * @default true
   */
  readonly terminateInstancesWithExpiration?: boolean;

  /**
   * Where to place the instance within the VPC.
   *
   * @default - Private subnets.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The end date and time of the request, in UTC format (YYYY -MM -DD T*HH* :MM :SS Z).
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
export interface ISpotEventPluginFleet extends IResource, IConnectable, IScriptHost, IGrantable {
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
   *     `workerFleet.allowRemoteControlFrom(Peer.ipv4('10.0.0.0/24').connections)`
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
   *     `workerFleet.allowRemoteControlTo(Peer.ipv4('10.0.0.0/24').connections)`
   */
  allowRemoteControlTo(other: IConnectable): void;
}

/**
 * This construct reperesents a fleet from the Spot Fleet Request created by the Spot Event Plugin.
 *
 * The construct itself doesn't create the Spot Fleet Request, but it deployes all the resources
 * required for the Spot Fleet Request and generates the Spot Fleet Configuration setting:
 * a JSON dictionary that represents a one to one mapping between a Deadline Group and Spot Fleet Request Configurations.
 *
 * Resources Deployed
 * ------------------------
 * - An Instance Role, corresponding IAM Policy and an Instance Profile.
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
   * The stack in which this fleet is defined.
   */
  public readonly stack: Stack;

  /**
   * The environment this resource belongs to.
   */
  public readonly env: ResourceEnvironment;

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
   * An IAM role that grants the Spot Fleet the permission to request, launch, terminate, and tag instances on your behalf.
   */
  public readonly fleetRole: IRole;

  /**
   * Spot Fleet Configurations constructed from the provided input.
   * Each congiguration is a mapping between one Deadline Group and one Spot Fleet Request Configuration.
   */
  public readonly spotFleetRequestConfigurations: any[];

  /**
   * An id of the Worker AMI.
   */
  protected readonly imageId: string;

  /**
   * The tags to apply during creation of instances and of the Spot Fleet Request.
   */
  protected readonly tags: TagManager;

  constructor(scope: Construct, id: string, props: SpotEventPluginFleetProps) {
    super(scope, id);

    this.stack = Stack.of(scope);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };

    this.validateProps(props);

    this.securityGroups = props.securityGroups ?? [ new SecurityGroup(this, 'SpotFleetSecurityGroup', { vpc: props.vpc }) ];
    this.connections = new Connections({ securityGroups: this.securityGroups });
    this.connections.allowToDefaultPort(props.renderQueue.endpoint);

    this.fleetInstanceRole = props.fleetInstanceRole ?? new Role(this, 'SpotFleetInstanceRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
      ],
      description: `Role for ${id} in region ${this.env.region}`,
      roleName: 'DeadlineSpot' + this.calculateResourceTagValue([this]),
    });
    this.grantPrincipal = this.fleetInstanceRole;

    this.fleetRole = props.fleetRole ?? new Role(this, 'FleetRole', {
      assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
      ],
    });

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

    this.spotFleetRequestConfigurations = this.generateSpotFleetRequestConfig(props);
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

  private generateSpotFleetRequestConfig(props: SpotEventPluginFleetProps): any {
    const iamProfile = new CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [this.fleetInstanceRole.roleName],
    });

    const securityGroupsToken = Lazy.any({ produce: () => {
      return this.securityGroups.map(sg => { return { GroupId: sg.securityGroupId }; });
    } });

    const userDataToken = Lazy.string({ produce: () => Fn.base64(this.userData.render()) });

    const blockDeviceMappings = (props.blockDevices !== undefined ?
      this.synthesizeBlockDeviceMappings(props.blockDevices) : undefined);

    const { subnets } = props.vpc.selectSubnets(props.vpcSubnets);
    const subnetIds = subnets.map(subnet => {
      return subnet.subnetId;
    });
    const subnetId = subnetIds.length != 0 ? subnetIds.join(',') : undefined;

    const instanceTagsToken = this.tagsToken(SpotFleetResourceType.INSTANCE);
    const spotFleetRequestTagsToken = this.tagsToken(SpotFleetResourceType.SPOT_FLEET_REQUEST);

    const launchSpecifications: SpotFleetRequestLaunchSpecification[] = [];

    props.instanceTypes.map(instanceType => {
      const launchSpecification: SpotFleetRequestLaunchSpecification = {
        BlockDeviceMappings: blockDeviceMappings,
        IamInstanceProfile: {
          Arn: iamProfile.attrArn,
        },
        ImageId: this.imageId,
        KeyName: props.keyName,
        SecurityGroups: securityGroupsToken,
        SubnetId: subnetId,
        TagSpecifications: instanceTagsToken,
        UserData: userDataToken,
        InstanceType: instanceType.toString(),
      };
      launchSpecifications.push(launchSpecification);
    });

    const spotFleetRequestProps: SpotFleetRequestProps = {
      AllocationStrategy: props.allocationStrategy ?? SpotFleetAllocationStrategy.LOWEST_PRICE,
      IamFleetRole: this.fleetRole.roleArn,
      LaunchSpecifications: launchSpecifications,
      ReplaceUnhealthyInstances: props.replaceUnhealthyInstances ?? true,
      TargetCapacity: props.targetCapacity,
      TerminateInstancesWithExpiration: props.terminateInstancesWithExpiration ?? true,
      Type: SpotFleetRequestType.MAINTAIN,
      ValidUntil: props.validUntil ? props.validUntil?.date.toUTCString() : undefined,
      TagSpecifications: spotFleetRequestTagsToken,
    };

    const spotFleetRequestConfigurations = props.deadlineGroups.map(group => {
      const spotFleetRequestConfiguration = {
        [group]: spotFleetRequestProps,
      };
      return spotFleetRequestConfiguration;
    });

    return spotFleetRequestConfigurations;
  }

  private tagsToken(resourceType: SpotFleetResourceType): IResolvable {
    return Lazy.any({
      produce: () => {
        if (this.tags.hasTags()) {
          const tagSpecification: TagSpecification = {
            ResourceType: resourceType,
            Tags: this.tags.renderTags(),
          };
          return [tagSpecification];
        }
        return undefined;
      },
    });
  }

  private validateProps(props: SpotEventPluginFleetProps): void {
    this.validateInstanceTypes(props.instanceTypes);
    this.validateGroups('deadlineGroups', props.deadlineGroups);
    this.validateRegion('deadlineRegion', props.deadlineRegion);
    this.validateBlockDevices(props.blockDevices);
  }

  private validateInstanceTypes(array: InstanceType[]): void {
    if (array.length == 0) {
      throw new Error('At least one instance type is required for a Spot Fleet Request Configuration');
    }
  }

  private validateGroups(property: string, array: string[]): void {
    const regex: RegExp = /^(?!none$)[a-zA-Z0-9-_\*]+$/i;
    if (array.length == 0) {
      throw new Error('At least one Deadline Group is required for a Spot Fleet Request Configuration');
    }
    array.forEach(value => {
      if (!regex.test(value)) {
        throw new Error(`Invalid value: ${value} for property '${property}'. Valid characters are A-Z, a-z, 0-9, -, * and _. Also, group 'none' is reserved as the default group.`);
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

  private calculateResourceTagValue(constructs: Construct[]): string {
    const md5 = crypto.createHash('md5');
    constructs.forEach(construct => md5.update(Names.uniqueId(construct)));
    return md5.digest('hex');
  }

  /**
   * Synthesize an array of block device mappings from a list of block device
   *
   * @param blockDevices list of block devices
   */
  private synthesizeBlockDeviceMappings(blockDevices: BlockDevice[]): CfnLaunchConfiguration.BlockDeviceMappingProperty[] {
    return blockDevices.map<CfnLaunchConfiguration.BlockDeviceMappingProperty>(({ deviceName, volume, mappingEnabled }) => {
      const { virtualName, ebsDevice: ebs } = volume;

      if (volume === BlockDeviceVolume._NO_DEVICE || mappingEnabled === false) {
        return {
          deviceName,
          noDevice: true,
        };
      }

      if (ebs) {
        const { iops, volumeType } = ebs;

        if (!iops) {
          if (volumeType === EbsDeviceVolumeType.IO1) {
            throw new Error('iops property is required with volumeType: EbsDeviceVolumeType.IO1');
          }
        } else if (volumeType !== EbsDeviceVolumeType.IO1) {
          Annotations.of(this).addWarning('iops will be ignored without volumeType: EbsDeviceVolumeType.IO1');
        }
      }

      return {
        deviceName,
        ebs,
        virtualName,
      };
    });
  }
}
