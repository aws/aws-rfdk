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
  CfnTag,
  Construct,
  Fn,
  Expiration,
  IResource,
  // Lazy,
  Names,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';
import {
  IScriptHost,
  LogGroupFactoryProps,
} from '../../core';
import {
  RFDK_VERSION,
  tagConstruct,
  TAG_NAME,
} from '../../core/lib/runtime-info';
import {
  IRenderQueue,
} from './render-queue';
import {
  IInstanceUserDataProvider,
  WorkerInstanceConfiguration,
} from './worker-configuration';

/**
 * The allocation strategy for the Spot Instances in your Spot Fleet
 * determines how it fulfills your Spot Fleet request from the possible
 * Spot Instance pools represented by its launch specifications.
 */
export enum SEPSpotFleetAllocationStrategy {
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
enum ISpotFleetResourceType {
  /**
   * EC2 Instances.
   */
  INSTANCE = 'instance',

  /**
   * EC2 Instances.
   */
  SPOT_FLEET_REQUEST = 'spot-fleet-request',
}

/**
 * Properties for the Spot Event Plugin Worker Fleet.
 */
export interface SEPSpotFleetProps {
  /**
   * VPC to launch the worker fleet in.
   */
  readonly vpc: IVpc;

  /**
   * Endpoint for the RenderQueue, to which the worker fleet needs to be connected.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * AMI of the deadline worker to launch.
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
   * Deadline groups these workers needs to be assigned to. The group is
   * created if it does not already exist.
   *
   * @default - Workers are not assigned to any group
   */
  readonly deadlineGroups: string[];

  /**
   * Deadline pools these workers needs to be assigned to. The pool is created
   * if it does not already exist.
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
   *    const role = new iam.Role(this, 'FleetRole', {
   *      assumedBy: new iam.ServicePrincipal('spotfleet.amazonaws.com'),
   *      managedPolicies: [
   *        ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
   *      ],
   *    });
   */
  readonly fleetRole: IRole;

  /**
   * Deadline region these workers needs to be assigned to.
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
   *    const role = new iam.Role(this, 'MyRole', {
   *      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
   *      managedPolicies: [
   *        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
   *      ],
   *      roleName: 'DeadlineSpot' + ...,
   *    });
   *
   * @default - A role will automatically be created.
   */
  readonly role?: IRole;

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
   * @default - SEPSpotFleetAllocationStrategy.LOWEST_PRICE.
   */
  readonly allocationStrategy?: SEPSpotFleetAllocationStrategy;

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
   */
  readonly userDataProvider?: IInstanceUserDataProvider;

  /**
   * The tags to apply during creation of instances.
   *
   * @default - Only RFDK tags are applied.
   */
  readonly instanceTags?: CfnTag[];

  /**
   * The tags to apply during creation of Spot Fleet request.
   *
   * @default - Only RFDK tags are applied.
   */
  readonly spotFleetRequestTags?: CfnTag[];
}

/**
 * Synthesize an array of block device mappings from a list of block device
 *
 * @param construct the instance/asg construct, used to host any warning
 * @param blockDevices list of block devices
 */
function synthesizeBlockDeviceMappings(construct: Construct, blockDevices: BlockDevice[]): CfnLaunchConfiguration.BlockDeviceMappingProperty[] {
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
        Annotations.of(construct).addWarning('iops will be ignored without volumeType: EbsDeviceVolumeType.IO1');
      }
    }

    return {
      deviceName, ebs, virtualName,
    };
  });
}

/**
 * Interface for Spot Event Plugin Worker Fleet.
 */
export interface ISEPWorkerFleet extends IResource, IConnectable, IScriptHost, IGrantable {
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
 * A new or Spot Event Plugin Worker Fleet.
 */
abstract class SEPSpotFleetBase extends Construct implements ISEPWorkerFleet {
  /**
   * The security groups/rules used to allow network connections.
   */
  public abstract readonly connections: Connections;

  /**
   * The principal to grant permissions to.
   */
  public abstract readonly grantPrincipal: IPrincipal;

  /**
   * The stack in which this fleet is defined.
   */
  public abstract readonly stack: Stack;

  /**
   * The environment this resource belongs to.
   */
  public abstract readonly env: ResourceEnvironment;

  /**
   * The user data that instances use when starting up.
   */
  public abstract readonly userData: UserData;

  /**
   * The operating system of the script host.
   */
  public abstract readonly osType: OperatingSystemType;

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
export class SEPSpotFleet extends SEPSpotFleetBase {
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
   * The principal to grant permissions to.
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
  public readonly listeningPorts: Port;

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
  public readonly role: IRole;

  /**
   * The tags to apply during creation of instances.
   */
  public readonly instanceTags: CfnTag[];

  /**
   * The tags to apply during creation of the Spot Fleet Request.
   */
  public readonly spotFleetRequestTags: CfnTag[];

  /**
   * An IAM role that grants the Spot Fleet the permission to request, launch, terminate, and tag instances on your behalf.
   */
  public readonly iamFleetRole: IRole;

  /**
   * Spot Fleet Configurations constructed from the provided input.
   * Each congiguration is a mapping between one Deadline Group and one Spot Fleet Request Configuration.
   */
  public readonly sepSpotFleetRequestConfigurations: any[];

  /**
   * An id of the worker AMI.
   */
  protected readonly imageId: string;


  constructor(scope: Construct, id: string, props: SEPSpotFleetProps) {
    super(scope, id);

    this.stack = Stack.of(scope);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };

    this.validateProps(props);

    this.securityGroups = props.securityGroups ?? [ new SecurityGroup(this, 'SEPConfigurationSecurityGroup', { vpc: props.vpc }) ];
    this.connections = new Connections({ securityGroups: this.securityGroups });
    this.connections.allowToDefaultPort(props.renderQueue.endpoint);

    this.role = props.role ?? new Role(this, 'SpotWorkerRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
      ],
      description: `Role for ${id} in region ${this.env.region}`,
      roleName: 'DeadlineSpot' + this.calculateResourceTagValue([this]),
    });
    this.grantPrincipal = this.role;

    this.iamFleetRole = props.fleetRole;

    const imageConfig = props.workerMachineImage.getImage(this);
    this.osType = imageConfig.osType;
    this.userData = props.userData ?? imageConfig.userData;
    this.imageId = imageConfig.imageId;

    const workerConfig = new WorkerInstanceConfiguration(this, id, {
      worker: this,
      cloudwatchLogSettings: {
        logGroupPrefix: SEPSpotFleet.DEFAULT_LOG_GROUP_PREFIX,
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

    this.listeningPorts = Port.tcpRange(
      workerConfig.listenerPort,
      workerConfig.listenerPort + SEPSpotFleet.MAX_WORKERS_PER_HOST,
    );

    const rfdkTag = this.rfdkTagSpecification();
    this.instanceTags = props.instanceTags ?? [];
    this.instanceTags.push(rfdkTag);

    this.spotFleetRequestTags = props.spotFleetRequestTags ?? [];
    this.spotFleetRequestTags.push(rfdkTag);

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);

    this.sepSpotFleetRequestConfigurations = this.generateSpotFleetRequestConfig(props);
  }

  private generateSpotFleetRequestConfig(props: SEPSpotFleetProps) {
    const iamProfile = new CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [this.role.roleName],
    });

    const securityGroups = this.securityGroups.map(sg => {
      return { GroupId: sg.securityGroupId };
    });

    const userData = Fn.base64(this.userData.render());

    const blockDeviceMappings = (props.blockDevices !== undefined ?
      synthesizeBlockDeviceMappings(this, props.blockDevices) : undefined);

    const { subnets } = props.vpc.selectSubnets(props.vpcSubnets);
    const subnetIds = subnets.map(subnet => {
      return subnet.subnetId;
    });
    const subnetId = subnetIds.length != 0 ? subnetIds.join(',') : undefined;

    const instanceTags = this.instanceTags.map(tag => {
      return {
        Key: tag.key,
        Value: tag.value,
      };
    });

    const spotFleetRequestTags = this.spotFleetRequestTags.map(tag => {
      return {
        Key: tag.key,
        Value: tag.value,
      };
    });

    let launchSpecifications: any[] = [];

    props.instanceTypes.map(instanceType => {
      const launchSpecification = {
        BlockDeviceMappings: blockDeviceMappings,
        IamInstanceProfile: {
          Arn: iamProfile.attrArn,
        },
        ImageId: this.imageId,
        KeyName: props.keyName,
        SecurityGroups: securityGroups,
        SubnetId: subnetId,
        TagSpecifications: [
          {
            ResourceType: ISpotFleetResourceType.INSTANCE,
            Tags: instanceTags,
          },
        ],
        UserData: userData,
        InstanceType: instanceType.toString(),
      };
      launchSpecifications.push(launchSpecification);
    });

    const spotFleetRequestConfiguration = {
      AllocationStrategy: props.allocationStrategy,
      IamFleetRole: this.iamFleetRole.roleArn,
      LaunchSpecifications: launchSpecifications,
      ReplaceUnhealthyInstances: true,
      TargetCapacity: props.targetCapacity,
      TerminateInstancesWithExpiration: true,
      Type: 'maintain',
      ValidUntil: props.validUntil ? props.validUntil?.date.toUTCString() : undefined,
      TagSpecifications: [
        {
          ResourceType: ISpotFleetResourceType.SPOT_FLEET_REQUEST,
          Tags: spotFleetRequestTags,
        },
      ],
    };

    const sepSpotFleetRequestConfigurations = props.deadlineGroups.map(group => {
      const sepSpotFleetRequestConfiguration = {
        [group]: spotFleetRequestConfiguration,
      };
      return sepSpotFleetRequestConfiguration;
    });

    return sepSpotFleetRequestConfigurations;
  }

  private rfdkTagSpecification(): CfnTag {
    const className = this.constructor.name;
    const tagValue = `${RFDK_VERSION}:${className}`;
    return {
      key: TAG_NAME,
      value: tagValue,
    };
  }

  private validateProps(props: SEPSpotFleetProps) {
    this.validateInstanceTypes(props.instanceTypes);
    this.validateGroups(props.deadlineGroups);
    this.validateArrayGroupsSyntax(props.deadlineGroups, /^(?!none$)[a-zA-Z0-9-_]+$/i, 'deadlineGroups');
    this.validateRegion(props.deadlineRegion, /^(?!none$|all$|unrecognized$)[a-zA-Z0-9-_]+$/i);
    this.validateBlockDevices(props.blockDevices);
  }

  private validateInstanceTypes(array: InstanceType[]) {
    if (array.length == 0) {
      throw new Error('SEPSpotFleet: At least one Deadline Group is required for a Spot Fleet Request Configuration');
    }
  }

  private validateGroups(array: string[]) {
    if (array.length == 0) {
      throw new Error('SEPSpotFleet: At least one Deadline Group is required for a Spot Fleet Request Configuration');
    }
  }

  private validateArrayGroupsSyntax(array: string[] | undefined, regex: RegExp, property: string) {
    if (array) {
      array.forEach(value => {
        if (!regex.test(value)) {
          throw new Error(`Invalid value: ${value} for property '${property}'. Valid characters are A-Z, a-z, 0-9, - and _. Also, group 'none' is reserved as the default group.`);
        }
      });
    }
  }

  private validateRegion(region: string | undefined, regex: RegExp) {
    if (region && !regex.test(region)) {
      throw new Error(`Invalid value: ${region} for property 'region'. Valid characters are A-Z, a-z, 0-9, - and _. ‘All’, ‘none’ and ‘unrecognized’ are reserved names that cannot be used.`);
    }
  }

  private validateBlockDevices(blockDevices: BlockDevice[] | undefined) {
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
}