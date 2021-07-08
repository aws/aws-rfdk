/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PluginSettings,
  SpotFleetRequestConfiguration,
  SpotFleetRequestProps,
  SpotFleetTagSpecification,
  LaunchTemplateConfig,
  LaunchTemplateSpecification,
  LaunchTemplateOverrides,
} from './types';

/**
 * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat expected by the Spot Event Plugin.
 * boolean and number properties get converted into strings when passed to the Lambda,
 * so we need to restore the original types.
 */
export function convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: SpotFleetRequestConfiguration): SpotFleetRequestConfiguration {
  const convertedSpotFleetRequestConfigs: SpotFleetRequestConfiguration = {};

  for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
    const convertedSpotFleetRequestProps: SpotFleetRequestProps = {
      AllocationStrategy: validateString(sfrConfigs.AllocationStrategy, `${group_name}.AllocationStrategy`),
      IamFleetRole: validateString(sfrConfigs.IamFleetRole, `${group_name}.IamFleetRole`),
      // Empty array needed for compatibility with SEP since it expects an array for the LaunchSpecifications property
      LaunchSpecifications: [],
      LaunchTemplateConfigs: sfrConfigs.LaunchTemplateConfigs ? validateLaunchTemplateConfigs(sfrConfigs.LaunchTemplateConfigs, `${group_name}.LaunchTemplateConfigs`) : undefined,
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
 * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat expected by the Spot Event Plugin.
 * boolean and number properties get converted into strings when passed to the Lambda,
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

export function isValidTagSpecification(tagSpecification: SpotFleetTagSpecification): boolean {
  if (!tagSpecification || typeof(tagSpecification) !== 'object' || Array.isArray(tagSpecification)) { return false; }
  // We also verify resourceType with validateString later
  if (!tagSpecification.ResourceType || typeof(tagSpecification.ResourceType) !== 'string') { return false; }
  if (!tagSpecification.Tags || !Array.isArray(tagSpecification.Tags)) { return false; }
  for (let element of tagSpecification.Tags) {
    if (!element || typeof(element) !== 'object') { return false; };
    if (!element.Key || typeof(element.Key) !== 'string') { return false; }
    if (!element.Value || typeof(element.Value) !== 'string') { return false; }
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

export function validateLaunchTemplateSpecification(launchTemplateSpecification: LaunchTemplateSpecification, propertyName: string): void {
  const id = validateStringOptional(launchTemplateSpecification.LaunchTemplateId, `${propertyName}.LaunchTemplateId`);
  const name = validateStringOptional(launchTemplateSpecification.LaunchTemplateName, `${propertyName}.LaunchTemplateName`);
  if ((id === undefined && name === undefined) || (id !== undefined && name !== undefined)) {
    throw new Error(`Exactly one of ${propertyName}.LaunchTemplateId or ${propertyName}.LaunchTemplateName must be specified, but got: ${id} and ${name} respectively`);
  }
  validateString(launchTemplateSpecification.Version, `${propertyName}.Version`);
}

export function validateLaunchTemplateOverrides(launchTemplateOverrides: LaunchTemplateOverrides, propertyName: string) {
  validateStringOptional(launchTemplateOverrides.AvailabilityZone, `${propertyName}.AvailabilityZone`);
  validateStringOptional(launchTemplateOverrides.InstanceType, `${propertyName}.InstanceType`);
  validateStringOptional(launchTemplateOverrides.SpotPrice, `${propertyName}.SpotPrice`);
  validateStringOptional(launchTemplateOverrides.SubnetId, `${propertyName}.SubnetId`);
  validateProperty(num => num === undefined || typeof num === 'number', launchTemplateOverrides.WeightedCapacity, `${propertyName}.WeightedCapacity`);
}

export function validateLaunchTemplateConfigs(launchTemplateConfigs: LaunchTemplateConfig[], propertyName: string): LaunchTemplateConfig[] {
  validateArray(launchTemplateConfigs, propertyName);

  launchTemplateConfigs.forEach(ltc => {
    validateProperty(input => input !== undefined && typeof input === 'object' || !Array.isArray(input), ltc.LaunchTemplateSpecification, `${propertyName}.LaunchTemplateSpecification`);
    validateLaunchTemplateSpecification(ltc.LaunchTemplateSpecification, `${propertyName}.LaunchTemplateSpecification`);

    validateProperty(input => Array.isArray(input), ltc.Overrides, `${propertyName}.Overrides`);
    ltc.Overrides.forEach(override => validateLaunchTemplateOverrides(override, `${propertyName}.Overrides`));
  });

  return launchTemplateConfigs;
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
