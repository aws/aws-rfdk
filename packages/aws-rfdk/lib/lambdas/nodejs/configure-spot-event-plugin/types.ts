/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * Interface for communication between Lambda and ConfigureSpotEventPlugin construct.
 * All the properties correspond to SpotEventPluginSettings from '../../../deadline/lib/configure-spot-event-plugin',
 * but the types and name may differ.
 */
export interface PluginSettings {
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
 * The input to the SEPConfiguratorResource
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
  readonly spotFleetRequestConfigurations?: SpotFleetRequestConfiguration;

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options
   */
  readonly spotPluginConfigurations?: PluginSettings;
}

/**
 * The following interface represents a CfnLaunchConfiguration.BlockDeviceProperty intreface
*/
export interface BlockDeviceProperty {
  readonly DeleteOnTermination?: boolean;
  readonly Encrypted?: boolean;
  readonly Iops?: number;
  readonly SnapshotId?: string;
  readonly VolumeSize?: number;
  readonly VolumeType?: string;
}

/**
 * The following interface represents a CfnLaunchConfiguration.BlockDeviceMappingProperty interface
*/
export interface BlockDeviceMappingProperty {
  readonly DeviceName: string;
  readonly Ebs?: BlockDeviceProperty;
  readonly NoDevice?: boolean;
  readonly VirtualName?: string;
}

export interface SpotFleetInstanceProfile {
  readonly Arn: string;
}

export interface SpotFleetSecurityGroupId {
  readonly GroupId: string;
}

export interface SpotFleetTag {
  Key: string;
  Value: any;
}

export interface SpotFleetTagSpecification {
  readonly ResourceType: string;
  readonly Tags: SpotFleetTag[];
}

export interface LaunchSpecification
{
  readonly BlockDeviceMappings?: BlockDeviceMappingProperty[];
  readonly IamInstanceProfile: SpotFleetInstanceProfile;
  readonly ImageId: string;
  readonly SecurityGroups: SpotFleetSecurityGroupId[];
  readonly SubnetId?: string;
  readonly TagSpecifications: SpotFleetTagSpecification[];
  readonly UserData: string;
  readonly InstanceType: string;
  readonly KeyName?: string;
}

export interface SpotFleetRequestProps {
  readonly AllocationStrategy: string;
  readonly IamFleetRole: string;
  readonly LaunchSpecifications: LaunchSpecification[];
  readonly ReplaceUnhealthyInstances: boolean;
  readonly TargetCapacity: number;
  readonly TerminateInstancesWithExpiration: boolean;
  readonly Type: string;
  readonly TagSpecifications: SpotFleetTagSpecification[];
  /**
   * The end date and time of the request, in UTC format (YYYY -MM -DD T*HH* :MM :SS Z).
   * After the end date and time, no new Spot Instance requests are placed or able to fulfill the request.
   *
   * @default - the Spot Fleet request remains until you cancel it.
   */
  readonly ValidUntil?: string;
}

export interface SpotFleetRequestConfiguration {
  [groupName: string]: SpotFleetRequestProps;
}