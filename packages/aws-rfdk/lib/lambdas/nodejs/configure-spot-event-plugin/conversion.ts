/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BlockDeviceMappingProperty,
  BlockDeviceProperty,
  PluginSettings,
  SpotFleetInstanceProfile,
  SpotFleetRequestConfiguration,
  LaunchSpecification,
  SpotFleetRequestProps,
  SpotFleetSecurityGroupId,
  SpotFleetTagSpecification,
} from './types';

/**
 * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat
 * expected by the Spot Event Plugin. This requires renaming (often just capitalizing) properties, but also
 * boolean and number properties get converted into strings when passed to this custom resource,
 * so we need to restore the original types.
 */
export function convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: SpotFleetRequestConfiguration): SpotFleetRequestConfiguration {
  const convertedSpotFleetRequestConfigs: SpotFleetRequestConfiguration = {};

  for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
    const convertedSpotFleetRequestProps: SpotFleetRequestProps = {
      AllocationStrategy: validateString(sfrConfigs.AllocationStrategy, `${group_name}.AllocationStrategy`),
      IamFleetRole: validateString(sfrConfigs.IamFleetRole, `${group_name}.IamFleetRole`),
      LaunchSpecifications: convertLaunchSpecifications(sfrConfigs.LaunchSpecifications, `${group_name}.LaunchSpecifications`),
      ReplaceUnhealthyInstances: convertToBoolean(sfrConfigs.ReplaceUnhealthyInstances, `${group_name}.ReplaceUnhealthyInstances`),
      TargetCapacity: convertToInt(sfrConfigs.TargetCapacity, `${group_name}.TargetCapacity`),
      TerminateInstancesWithExpiration: convertToBoolean(sfrConfigs.TerminateInstancesWithExpiration, `${group_name}.TerminateInstancesWithExpiration`),
      Type: validateString(sfrConfigs.Type, `${group_name}.Type`),
      ValidUntil: validateStringOptional(sfrConfigs.ValidUntil, `${group_name}.ValidUntil`),
      TagSpecifications: convertTagSpecifications(sfrConfigs.TagSpecifications, `${group_name}.TagSpecifications`),
    };
    convertedSpotFleetRequestConfigs[group_name] = convertedSpotFleetRequestProps;
  }
  return convertedSpotFleetRequestConfigs;
}

/**
 * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat
 * expected by the Spot Event Plugin. This requires renaming (often just capitalizing) properties, but also
 * boolean and number properties get converted into strings when passed to this custom resource,
 * so we need to restore the original types.
 */
export function convertSpotEventPluginSettings(pluginOptions: PluginSettings): PluginSettings {
  return {
    AWSInstanceStatus: validateString(pluginOptions.AWSInstanceStatus, 'AWSInstanceStatus'),
    DeleteInterruptedSlaves: convertToBoolean(pluginOptions.DeleteInterruptedSlaves, 'DeleteInterruptedSlaves'),
    DeleteTerminatedSlaves: convertToBoolean(pluginOptions.DeleteTerminatedSlaves, 'DeleteTerminatedSlaves'),
    IdleShutdown: convertToInt(pluginOptions.IdleShutdown, 'IdleShutdown'),
    Logging: validateString(pluginOptions.Logging, 'Logging'),
    PreJobTaskMode: validateString(pluginOptions.PreJobTaskMode, 'PreJobTaskMode'),
    Region: validateString(pluginOptions.Region, 'Region'),
    ResourceTracker: convertToBoolean(pluginOptions.ResourceTracker, 'ResourceTracker'),
    StaggerInstances: convertToInt(pluginOptions.StaggerInstances, 'StaggerInstances'),
    State: validateString(pluginOptions.State, 'State'),
    StrictHardCap: convertToBoolean(pluginOptions.StrictHardCap, 'StrictHardCap'),
  };
}

export function validateArray(input: any, propertyName: string): void {
  if (!input || !Array.isArray(input) || input.length === 0) {
    throw new Error(`${propertyName} should be an array with at least one element.`);
  }
}

export function validateProperty(isValid: (input: any) => boolean, property: any, propertyName: string): void {
  if (!isValid(property)) {
    throw new Error(`${propertyName} type is not valid.`);
  }
}

export function isValidSecurityGroup(securityGroup: SpotFleetSecurityGroupId): boolean {
  if (!securityGroup || typeof(securityGroup) !== 'object'  || Array.isArray(securityGroup)) { return false; }
  // We also verify groupId with validateString later
  if (!securityGroup.GroupId || typeof(securityGroup.GroupId) !== 'string') { return false; }
  return true;
}

export function convertSecurityGroups(securityGroups: SpotFleetSecurityGroupId[], propertyName: string): SpotFleetSecurityGroupId[] {
  validateArray(securityGroups, propertyName);

  const convertedSecurityGroups: SpotFleetSecurityGroupId[] = securityGroups.map(securityGroup => {
    validateProperty(isValidSecurityGroup, securityGroup, propertyName);
    const convertedSecurityGroup: SpotFleetSecurityGroupId = {
      GroupId: validateString(securityGroup.GroupId, `${propertyName}.GroupId`),
    };
    return convertedSecurityGroup;
  });

  return convertedSecurityGroups;
}

export function isValidTagSpecification(tagSpecification: SpotFleetTagSpecification): boolean {
  if (!tagSpecification || typeof(tagSpecification) !== 'object' || Array.isArray(tagSpecification)) { return false; }
  // We also verify resourceType with validateString later
  if (!tagSpecification.ResourceType || typeof(tagSpecification.ResourceType) !== 'string') { return false; }
  if (!tagSpecification.Tags || !Array.isArray(tagSpecification.Tags)) { return false; }
  for (let element of tagSpecification.Tags) {
    if (!element || typeof(element) !== 'object') { return false; };
    if (!element.Key || typeof(element.Key) !== 'string' || !element.Value) { return false; }
  }
  return true;
}

export function convertTagSpecifications(tagSpecifications: SpotFleetTagSpecification[], propertyName: string): SpotFleetTagSpecification[] {
  validateArray(tagSpecifications, propertyName);

  const convertedTagSpecifications: SpotFleetTagSpecification[] = tagSpecifications.map(tagSpecification => {
    validateProperty(isValidTagSpecification, tagSpecification, propertyName);
    const convertedTagSpecification: SpotFleetTagSpecification = {
      ResourceType: validateString(tagSpecification.ResourceType, `${propertyName}.ResourceType`),
      Tags: tagSpecification.Tags,
    };
    return convertedTagSpecification;
  });

  return convertedTagSpecifications;
}

export function isValidDeviceMapping(deviceMapping: BlockDeviceMappingProperty): boolean {
  if (!deviceMapping || typeof(deviceMapping) !== 'object' || Array.isArray(deviceMapping)) { return false; }
  // We validate the rest properties when convert them.
  return true;
}

export function convertEbs(ebs: BlockDeviceProperty, propertyName: string): BlockDeviceProperty {
  const convertedEbs: BlockDeviceProperty = {
    DeleteOnTermination: convertToBooleanOptional(ebs.DeleteOnTermination, `${propertyName}.DeleteOnTermination`),
    Encrypted: convertToBooleanOptional(ebs.Encrypted, `${propertyName}.Encrypted`),
    Iops: convertToIntOptional(ebs.Iops, `${propertyName}.Iops`),
    SnapshotId: validateStringOptional(ebs.SnapshotId, `${propertyName}.SnapshotId`),
    VolumeSize: convertToIntOptional(ebs.VolumeSize, `${propertyName}.VolumeSize`),
    VolumeType: validateStringOptional(ebs.VolumeType, `${propertyName}.VolumeType`),
  };
  return convertedEbs;
}

export function convertBlockDeviceMapping(blockDeviceMappings: BlockDeviceMappingProperty[], propertyName: string): BlockDeviceMappingProperty[] {
  validateArray(blockDeviceMappings, propertyName);
  const convertedBlockDeviceMappings: BlockDeviceMappingProperty[] = blockDeviceMappings.map(deviceMapping => {
    validateProperty(isValidDeviceMapping, deviceMapping, propertyName);

    const convertedDeviceMapping: BlockDeviceMappingProperty = {
      DeviceName: validateString(deviceMapping.DeviceName, `${propertyName}.DeviceName`),
      Ebs: deviceMapping.Ebs ? convertEbs(deviceMapping.Ebs, `${propertyName}.Ebs`) : undefined,
      NoDevice: validateStringOptional(deviceMapping.NoDevice, `${propertyName}.NoDevice`),
      VirtualName: validateStringOptional(deviceMapping.VirtualName, `${propertyName}.VirtualName`),
    };
    return convertedDeviceMapping;
  });
  return convertedBlockDeviceMappings;
}

export function isValidInstanceProfile(instanceProfile: SpotFleetInstanceProfile): boolean {
  if (!instanceProfile || typeof(instanceProfile) !== 'object' || Array.isArray(instanceProfile)) { return false; }
  // We also verify arn with validateString later
  if (!instanceProfile.Arn || typeof(instanceProfile.Arn) !== 'string') { return false; }
  return true;
}

export function convertInstanceProfile(instanceProfile: SpotFleetInstanceProfile, propertyName: string): SpotFleetInstanceProfile {
  validateProperty(isValidInstanceProfile, instanceProfile, propertyName);
  const convertedInstanceProfile: SpotFleetInstanceProfile = {
    Arn: validateString(instanceProfile.Arn, `${propertyName}.Arn`),
  };
  return convertedInstanceProfile;
}

export function convertLaunchSpecifications(launchSpecifications: LaunchSpecification[], propertyName: string): LaunchSpecification[] {
  validateArray(launchSpecifications, propertyName);

  const convertedLaunchSpecifications: LaunchSpecification[] = [];
  launchSpecifications.map(launchSpecification => {
    const SecurityGroups = convertSecurityGroups(launchSpecification.SecurityGroups, `${propertyName}.SecurityGroups`);
    const TagSpecifications = convertTagSpecifications(launchSpecification.TagSpecifications, `${propertyName}.TagSpecifications`);
    const BlockDeviceMappings = launchSpecification.BlockDeviceMappings ?
      convertBlockDeviceMapping(launchSpecification.BlockDeviceMappings, `${propertyName}.BlockDeviceMappings`) : undefined;

    const convertedLaunchSpecification: LaunchSpecification = {
      BlockDeviceMappings,
      IamInstanceProfile: convertInstanceProfile(launchSpecification.IamInstanceProfile, `${propertyName}.IamInstanceProfile`),
      ImageId: validateString(launchSpecification.ImageId, `${propertyName}.ImageId`),
      KeyName: validateStringOptional(launchSpecification.KeyName, `${propertyName}.KeyName`),
      SecurityGroups,
      SubnetId: validateStringOptional(launchSpecification.SubnetId, `${propertyName}.SubnetId`),
      TagSpecifications,
      UserData: validateString(launchSpecification.UserData, `${propertyName}.UserData`),
      InstanceType: validateString(launchSpecification.InstanceType, `${propertyName}.InstanceType`),
    };
    convertedLaunchSpecifications.push(convertedLaunchSpecification);
  });
  return convertedLaunchSpecifications;
}

export function convertToInt(value: any, propertyName: string): number {
  if (typeof(value) === 'number') {
    if (Number.isInteger(value)) {
      return value;
    }
  }

  if (typeof(value) === 'string') {
    const result = Number.parseFloat(value);
    if (Number.isInteger(result)) {
      return result;
    }
  }

  throw new Error(`The value of ${propertyName} should be an integer. Received: ${value} of type ${typeof(value)}`);
}

export function convertToIntOptional(value: any, propertyName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return convertToInt(value, propertyName);
}

export function convertToBoolean(value: any, propertyName: string): boolean {
  if (typeof(value) === 'boolean') {
    return value;
  }

  if (typeof(value) === 'string') {
    if (value === 'true') { return true; }
    if (value === 'false') { return false; }
  }

  throw new Error(`The value of ${propertyName} should be a boolean. Received: ${value} of type ${typeof(value)}`);
}

export function convertToBooleanOptional(value: any, propertyName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return convertToBoolean(value, propertyName);
}

export function validateString(value: any, propertyName: string): string {
  if (typeof(value) === 'string') {
    return value;
  }

  throw new Error(`The value of ${propertyName} should be a string. Received: ${value} of type ${typeof(value)}`);
}

export function validateStringOptional(value: any, propertyName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return validateString(value, propertyName);
}
