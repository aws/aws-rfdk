/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface for communication between Lambda and ConfigureSpotEventPlugin construct.
 * All the properties correspond to SpotEventPluginSettings from '../../../deadline/lib/configure-spot-event-plugin',
 * but the types and name may differ.
 */
export interface InternalSpotEventPluginSettings {
  readonly AWSInstanceStatus: string;
  readonly DeleteInterruptedSlaves: boolean;
  readonly DeleteTerminatedSlaves: boolean;
  readonly IdleShutdown: number;
  readonly Logging: string;
  readonly PreJobTaskMode: string;
  readonly Region: string;
  readonly ResourceTracker: boolean;
  readonly StaggerInstances: number;
  readonly State: string;
  readonly StrictHardCap: boolean;
}

/**
 * Values required for establishing a connection to a TLS-enabled Render Queue.
 */
export interface ConnectionOptions {
  /**
   * Fully qualified domain name of the Render Queue.
   */
  readonly hostname: string;

  /**
   * Port on the Render Queue to connect to.
   */
  readonly port: string;

  /**
   * Protocol used to connect to the Render Queue.
   * Allowed values: 'HTTP' and 'HTTPS'.
   */
  readonly protocol: string;

  /**
   * The ARN of the CA certificate stored in the SecretsManager.
   */
  readonly caCertificateArn?: string;
}

/**
 * The input to this Custom Resource
 */
export interface SEPConfiguratorResourceProps {
  /**
   * Info for connecting to the Render Queue.
   */
  readonly connection: ConnectionOptions;

  /**
   * The Spot Fleet Request Configurations.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#example-spot-fleet-request-configurations
   */
  readonly spotFleetRequestConfigurations?: object;

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options
   */
  readonly spotPluginConfigurations?: InternalSpotEventPluginSettings;
}

/**
 * The following interface represents a simplified CfnLaunchConfiguration.BlockDeviceProperty
*/
export interface InternalBlockDeviceProperty {
  readonly DeleteOnTermination?: boolean;
  readonly Encrypted?: boolean;
  readonly Iops?: number;
  readonly SnapshotId?: string;
  readonly VolumeSize?: number;
  readonly VolumeType?: string;
}

/**
 * The following interface represents a simplified CfnLaunchConfiguration.BlockDeviceMappingProperty
*/
export interface InternalBlockDeviceMappingProperty {
  readonly DeviceName: string;
  readonly Ebs?: InternalBlockDeviceProperty;
  readonly NoDevice?: boolean;
  readonly VirtualName?: string;
}

export interface InternalSpotFleetInstanceProfile {
  readonly Arn: string;
}

export interface InternalSpotFleetSecurityGroupId {
  readonly GroupId: string;
}

export interface InternalTag {
  Key: string;
  Value: any;
}

export interface InternalSpotFleetTagSpecification {
  readonly ResourceType: string;
  readonly Tags: InternalTag[];
}

export interface InternalSpotFleetRequestLaunchSpecification
{
  readonly BlockDeviceMappings?: InternalBlockDeviceMappingProperty[];
  readonly IamInstanceProfile: InternalSpotFleetInstanceProfile;
  readonly ImageId: string;
  readonly SecurityGroups: InternalSpotFleetSecurityGroupId[];
  readonly SubnetId?: string;
  readonly TagSpecifications: InternalSpotFleetTagSpecification[];
  readonly UserData: string;
  readonly InstanceType: string;
  readonly KeyName?: string;
}

export interface InternalSpotFleetRequestProps {
  readonly AllocationStrategy: string;
  readonly IamFleetRole: string;
  readonly LaunchSpecifications: InternalSpotFleetRequestLaunchSpecification[];
  readonly ReplaceUnhealthyInstances: boolean;
  readonly TargetCapacity: number;
  readonly TerminateInstancesWithExpiration: boolean;
  readonly Type: string;
  readonly TagSpecifications: InternalSpotFleetTagSpecification[];
  readonly ValidUntil?: string;
}

export interface InternalSpotFleetRequestConfiguration {
  [groupName: string]: InternalSpotFleetRequestProps;
}