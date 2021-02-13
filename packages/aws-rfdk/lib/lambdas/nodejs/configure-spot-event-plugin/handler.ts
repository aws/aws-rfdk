/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import { SpotEventPluginClient } from '../lib/configure-spot-event-plugin';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import {
  isArn as isSecretArn,
  readCertificateData,
} from '../lib/secrets-manager';
import {
  ConnectionOptions,
  BlockDeviceMappingProperty,
  BlockDeviceProperty,
  PluginSettings,
  SpotFleetInstanceProfile,
  SpotFleetRequestConfiguration,
  LaunchSpecification,
  SpotFleetRequestProps,
  SpotFleetSecurityGroupId,
  SpotFleetTagSpecification,
  SEPConfiguratorResourceProps,
} from './types';

interface PluginProperty {
  readonly Key: string;
  readonly Value: any;
}

/**
 * A custom resource used to save Spot Event Plugin server data and configurations.
 */
export class SEPConfiguratorResource extends SimpleCustomResource {
  protected readonly secretsManagerClient: SecretsManager;

  constructor(secretsManagerClient: SecretsManager) {
    super();
    this.secretsManagerClient = secretsManagerClient;
  }

  /**
   * @inheritdoc
   */
  public validateInput(data: object): boolean {
    return this.implementsSEPConfiguratorResourceProps(data);
  }

  /**
   * @inheritdoc
   */
  public async doCreate(_physicalId: string, resourceProperties: SEPConfiguratorResourceProps): Promise<object|undefined> {
    const spotEventPluginClient = await this.spotEventPluginClient(resourceProperties.connection);

    if (resourceProperties.spotFleetRequestConfigurations) {
      const convertedSpotFleetRequestConfigs = this.convertSpotFleetRequestConfiguration(resourceProperties.spotFleetRequestConfigurations);
      const stringConfigs = JSON.stringify(convertedSpotFleetRequestConfigs);
      const response = await spotEventPluginClient.saveServerData(stringConfigs);
      if (!response) {
        throw new Error(`Failed to save spot fleet request with configuration: ${stringConfigs}`);
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const convertedSpotPluginConfigs = this.convertSpotEventPluginSettings(resourceProperties.spotPluginConfigurations);
      const pluginSettings = this.toPluginPropertyArray(convertedSpotPluginConfigs);
      const securitySettings = this.securitySettings();
      const response = await spotEventPluginClient.configureSpotEventPlugin([...pluginSettings, ...securitySettings]);
      if (!response) {
        throw new Error(`Failed to save Spot Event Plugin Configurations: ${resourceProperties.spotPluginConfigurations}`);
      }
    }
    return undefined;
  }

  /**
   * @inheritdoc
   */
  public async doDelete(_physicalId: string, _resourceProperties: SEPConfiguratorResourceProps): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  private implementsSEPConfiguratorResourceProps(value: any): value is SEPConfiguratorResourceProps {
    if (!value || typeof(value) !== 'object') { return false; }
    if (!this.implementsConnectionOptions(value.connection)) { return false; }
    return true;
  }

  private implementsConnectionOptions(value: any): value is ConnectionOptions {
    if (!value || typeof(value) !== 'object') { return false; }
    if (!value.hostname || typeof(value.hostname) !== 'string') { return false; }
    if (!value.port || typeof(value.port) !== 'string') { return false; }
    const portNum = Number.parseInt(value.port, 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) { return false; }
    if (!value.protocol || typeof(value.protocol) !== 'string') { return false; }
    if (value.protocol !== 'HTTP' && value.protocol !== 'HTTPS') { return false; }
    if (!this.isSecretArnOrUndefined(value.caCertificateArn)) { return false; }
    return true;
  }

  private isSecretArnOrUndefined(value: any): boolean {
    if (value) {
      if (typeof(value) !== 'string' || !isSecretArn(value)) { return false; }
    }
    return true;
  }

  private async spotEventPluginClient(connection: ConnectionOptions): Promise<SpotEventPluginClient> {
    return new SpotEventPluginClient({
      deadlineClientProps: {
        host: connection.hostname,
        port: Number.parseInt(connection.port, 10),
        protocol: connection.protocol,
        tls: {
          ca: connection.caCertificateArn ? await readCertificateData(connection.caCertificateArn, this.secretsManagerClient) : undefined,
        },
      },
    });
  }

  /**
   * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat
   * expected by the Spot Event Plugin. This requires renaming (often just capitalizing) properties, but also
   * boolean and number properties get converted into strings when passed to this custom resource,
   * so we need to restore the original types.
   */
  private convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: SpotFleetRequestConfiguration): SpotFleetRequestConfiguration {
    const convertedSpotFleetRequestConfigs: SpotFleetRequestConfiguration = {};

    for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
      const convertedSpotFleetRequestProps: SpotFleetRequestProps = {
        AllocationStrategy: this.convertToString(sfrConfigs.AllocationStrategy, `${group_name}.AllocationStrategy`),
        IamFleetRole: this.convertToString(sfrConfigs.IamFleetRole, `${group_name}.IamFleetRole`),
        LaunchSpecifications: this.convertLaunchSpecifications(sfrConfigs.LaunchSpecifications, `${group_name}.LaunchSpecifications`),
        ReplaceUnhealthyInstances: this.convertToBoolean(sfrConfigs.ReplaceUnhealthyInstances, `${group_name}.ReplaceUnhealthyInstances`),
        TargetCapacity: this.convertToInt(sfrConfigs.TargetCapacity, `${group_name}.TargetCapacity`),
        TerminateInstancesWithExpiration: this.convertToBoolean(sfrConfigs.TerminateInstancesWithExpiration, `${group_name}.TerminateInstancesWithExpiration`),
        Type: this.convertToString(sfrConfigs.Type, `${group_name}.Type`),
        ValidUntil: this.convertToStringOptional(sfrConfigs.ValidUntil, `${group_name}.ValidUntil`),
        TagSpecifications: this.convertTagSpecifications(sfrConfigs.TagSpecifications, `${group_name}.TagSpecifications`),
      };
      convertedSpotFleetRequestConfigs[group_name] = convertedSpotFleetRequestProps;
    }
    return convertedSpotFleetRequestConfigs;
  }

  private validateArray(input: any, property: string): void {
    if (!input || !Array.isArray(input) || input.length === 0) {
      throw new Error(`${property} should be an array with at least one element.`);
    }
  }

  private isValidSecurityGroup(securityGroup: SpotFleetSecurityGroupId): boolean {
    if (!securityGroup || typeof(securityGroup) !== 'object') { return false; }
    // We also verify groupId with convertToString later
    if (!securityGroup.GroupId || typeof(securityGroup.GroupId) !== 'string') { return false; }
    return true;
  }

  private validateSecurityGroup(securityGroup: SpotFleetSecurityGroupId, property: string): void {
    if (!this.isValidSecurityGroup(securityGroup)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertSecurityGroups(securityGroups: SpotFleetSecurityGroupId[], property: string): SpotFleetSecurityGroupId[] {
    this.validateArray(securityGroups, property);

    const convertedSecurityGroups: SpotFleetSecurityGroupId[] = securityGroups.map(securityGroup => {
      this.validateSecurityGroup(securityGroup, property);
      const convertedSecurityGroup: SpotFleetSecurityGroupId = {
        GroupId: this.convertToString(securityGroup.GroupId, `${property}.GroupId`),
      };
      return convertedSecurityGroup;
    });

    return convertedSecurityGroups;
  }

  private isValidTagSpecification(tagSpecification: SpotFleetTagSpecification): boolean {
    if (!tagSpecification || typeof(tagSpecification) !== 'object') { return false; }
    // We also verify resourceType with convertToString later
    if (!tagSpecification.ResourceType || typeof(tagSpecification.ResourceType) !== 'string') { return false; }
    if (!tagSpecification.Tags || !Array.isArray(tagSpecification.Tags)) { return false; }
    for (let element of tagSpecification.Tags) {
      if (!element || typeof(element) !== 'object') { return false; };
      if (!element.Key || typeof(element.Key) !== 'string' || !element.Value) { return false; }
    }
    return true;
  }

  private validateTagSpecification(tagSpecification: SpotFleetTagSpecification, property: string): void {
    if (!this.isValidTagSpecification(tagSpecification)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertTagSpecifications(tagSpecifications: SpotFleetTagSpecification[], property: string): SpotFleetTagSpecification[] {
    this.validateArray(tagSpecifications, property);
    const convertedTagSpecifications: SpotFleetTagSpecification[] = tagSpecifications.map(tagSpecification => {
      this.validateTagSpecification(tagSpecification, property);
      const convertedTagSpecification: SpotFleetTagSpecification = {
        ResourceType: this.convertToString(tagSpecification.ResourceType, `${property}.ResourceType`),
        Tags: tagSpecification.Tags,
      };
      return convertedTagSpecification;
    });

    return convertedTagSpecifications;
  }

  private validateDeviceMapping(deviceMapping: BlockDeviceMappingProperty, property: string): void {
    if (!this.isValidDeviceMapping(deviceMapping)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private isValidDeviceMapping(deviceMapping: BlockDeviceMappingProperty): boolean {
    if (!deviceMapping || typeof(deviceMapping) !== 'object') { return false; }
    // We validate the rest properties when convert them.
    // TODO: maybe add for full validation
    return true;
  }

  private convertEbs(ebs: BlockDeviceProperty, property: string): BlockDeviceProperty {
    const convertedEbs: BlockDeviceProperty = {
      DeleteOnTermination: this.convertToBooleanOptional(ebs.DeleteOnTermination, `${property}.DeleteOnTermination`),
      Encrypted: this.convertToBooleanOptional(ebs.Encrypted, `${property}.Encrypted`),
      Iops: this.convertToIntOptional(ebs.Iops, `${property}.Iops`),
      SnapshotId: this.convertToStringOptional(ebs.SnapshotId, `${property}.SnapshotId`),
      VolumeSize: this.convertToIntOptional(ebs.VolumeSize, `${property}.VolumeSize`),
      VolumeType: this.convertToStringOptional(ebs.VolumeType, `${property}.VolumeType`),
    };
    return convertedEbs;
  }

  private convertBlockDeviceMapping(blockDeviceMappings: BlockDeviceMappingProperty[], property: string): BlockDeviceMappingProperty[] | undefined {
    if (!blockDeviceMappings) {
      return undefined;
    }

    this.validateArray(blockDeviceMappings, property);
    const convertedBlockDeviceMappings: BlockDeviceMappingProperty[] = blockDeviceMappings.map(deviceMapping => {
      this.validateDeviceMapping(deviceMapping, property);

      const convertedDeviceMapping: BlockDeviceMappingProperty = {
        DeviceName: this.convertToString(deviceMapping.DeviceName, `${property}.DeviceName`),
        Ebs: deviceMapping.Ebs ? this.convertEbs(deviceMapping.Ebs, `${property}.Ebs`) : undefined,
        NoDevice: this.convertToBooleanOptional(deviceMapping.NoDevice, `${property}.NoDevice`),
        VirtualName: this.convertToStringOptional(deviceMapping.VirtualName, `${property}.VirtualName`),
      };
      return convertedDeviceMapping;
    });
    return convertedBlockDeviceMappings;
  }

  private isValidInstanceProfile(instanceProfile: SpotFleetInstanceProfile): boolean {
    if (!instanceProfile || typeof(instanceProfile) !== 'object') { return false; }
    // We also verify arn with convertToString later
    if (!instanceProfile.Arn || typeof(instanceProfile.Arn) !== 'string') { return false; }
    return true;
  }

  private validadeInstanceProfile(instanceProfile: SpotFleetInstanceProfile, property: string): void {
    if (!this.isValidInstanceProfile(instanceProfile)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertInstanceProfile(instanceProfile: SpotFleetInstanceProfile, property: string): SpotFleetInstanceProfile {
    this.validadeInstanceProfile(instanceProfile, property);
    const convertedInstanceProfile: SpotFleetInstanceProfile = {
      Arn: this.convertToString(instanceProfile.Arn, `${property}.Arn`),
    };
    return convertedInstanceProfile;
  }

  private convertLaunchSpecifications(launchSpecifications: LaunchSpecification[], property: string): LaunchSpecification[] {
    this.validateArray(launchSpecifications, property);

    const convertedLaunchSpecifications: LaunchSpecification[] = [];
    launchSpecifications.map(launchSpecification => {
      const SecurityGroups = this.convertSecurityGroups(launchSpecification.SecurityGroups, `${property}.SecurityGroups`);
      const TagSpecifications = this.convertTagSpecifications(launchSpecification.TagSpecifications, `${property}.TagSpecifications`);
      const BlockDeviceMappings = launchSpecification.BlockDeviceMappings ? this.convertBlockDeviceMapping(launchSpecification.BlockDeviceMappings, `${property}.BlockDeviceMappings`) : undefined;

      const convertedLaunchSpecification: LaunchSpecification = {
        BlockDeviceMappings,
        IamInstanceProfile: this.convertInstanceProfile(launchSpecification.IamInstanceProfile, `${property}.IamInstanceProfile`),
        ImageId: this.convertToString(launchSpecification.ImageId, `${property}.ImageId`),
        KeyName: this.convertToStringOptional(launchSpecification.KeyName, `${property}.KeyName`),
        SecurityGroups,
        SubnetId: this.convertToStringOptional(launchSpecification.SubnetId, `${property}.SubnetId`),
        TagSpecifications,
        UserData: this.convertToString(launchSpecification.UserData, `${property}.UserData`),
        InstanceType: this.convertToString(launchSpecification.InstanceType, `${property}.InstanceType`),
      };
      convertedLaunchSpecifications.push(convertedLaunchSpecification);
    });
    return convertedLaunchSpecifications;
  }

  private convertToInt(value: any, property: string): number {
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

    throw new Error(`The value of ${property} should be an integer. Received: ${value} of type ${typeof(value)}`);
  }

  private convertToIntOptional(value: any, property: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.convertToInt(value, property);
  }

  private convertToBoolean(value: any, property: string): boolean {
    if (typeof(value) === 'boolean') {
      return value;
    }

    if (typeof(value) === 'string') {
      if (value === 'true') { return true; }
      if (value === 'false') { return false; }
    }

    throw new Error(`The value of ${property} should be a boolean. Received: ${value} of type ${typeof(value)}`);
  }

  private convertToBooleanOptional(value: any, property: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.convertToBoolean(value, property);
  }

  private convertToString(value: any, property: string): string {
    if (typeof(value) === 'string') {
      return value;
    }

    throw new Error(`The value of ${property} should be a string. Received: ${value} of type ${typeof(value)}`);
  }

  private convertToStringOptional(value: any, property: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.convertToString(value, property);
  }

  /**
   * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat
   * expected by the Spot Event Plugin. This requires renaming (often just capitalizing) properties, but also
   * boolean and number properties get converted into strings when passed to this custom resource,
   * so we need to restore the original types.
   */
  private convertSpotEventPluginSettings(pluginOptions: PluginSettings): PluginSettings {
    return {
      AWSInstanceStatus: this.convertToString(pluginOptions.AWSInstanceStatus, 'AWSInstanceStatus'),
      DeleteInterruptedSlaves: this.convertToBoolean(pluginOptions.DeleteInterruptedSlaves, 'DeleteInterruptedSlaves'),
      DeleteTerminatedSlaves: this.convertToBoolean(pluginOptions.DeleteTerminatedSlaves, 'DeleteTerminatedSlaves'),
      IdleShutdown: this.convertToInt(pluginOptions.IdleShutdown, 'IdleShutdown'),
      Logging: this.convertToString(pluginOptions.Logging, 'Logging'),
      PreJobTaskMode: this.convertToString(pluginOptions.PreJobTaskMode, 'PreJobTaskMode'),
      Region: this.convertToString(pluginOptions.Region, 'Region'),
      ResourceTracker: this.convertToBoolean(pluginOptions.ResourceTracker, 'ResourceTracker'),
      StaggerInstances: this.convertToInt(pluginOptions.StaggerInstances, 'StaggerInstances'),
      State: this.convertToString(pluginOptions.State, 'State'),
      StrictHardCap: this.convertToBoolean(pluginOptions.StrictHardCap, 'StrictHardCap'),
    };
  }

  private toPluginPropertyArray(input: PluginSettings): PluginProperty[] {
    const configs: PluginProperty[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) {
        throw new Error(`Value for ${key} should be defined.`);
      }
      configs.push({
        Key: key,
        Value: value,
      });
    }
    return configs;
  }

  private securitySettings(): PluginProperty[] {
    return [
      {
        Key: 'UseLocalCredentials',
        Value: true,
      },
      {
        Key: 'NamedProfile',
        Value: '',
      },
    ];
  }
}

/**
 * The lambda handler that is used to log in to MongoDB and perform some configuration actions.
 */
/* istanbul ignore next */
export async function configureSEP(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new SEPConfiguratorResource(new SecretsManager());
  return await handler.handler(event, context);
}
