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
  InternalBlockDeviceMappingProperty,
  InternalBlockDeviceProperty,
  InternalSpotEventPluginSettings,
  InternalSpotFleetInstanceProfile,
  InternalSpotFleetRequestConfiguration,
  InternalSpotFleetRequestLaunchSpecification,
  InternalSpotFleetRequestProps,
  InternalSpotFleetSecurityGroupId,
  InternalSpotFleetTagSpecification,
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
  private convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: object): InternalSpotFleetRequestConfiguration {
    const convertedSpotFleetRequestConfigs: InternalSpotFleetRequestConfiguration = {};

    for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
      const convertedSpotFleetRequestProps: InternalSpotFleetRequestProps = {
        AllocationStrategy: this.convertToString(sfrConfigs.allocationStrategy, `${group_name}.allocationStrategy`),
        IamFleetRole: this.convertToString(sfrConfigs.iamFleetRole, `${group_name}.iamFleetRole`),
        LaunchSpecifications: this.convertLaunchSpecifications(sfrConfigs.launchSpecifications, `${group_name}.launchSpecifications`),
        ReplaceUnhealthyInstances: this.convertToBoolean(sfrConfigs.replaceUnhealthyInstances, `${group_name}.replaceUnhealthyInstances`),
        TargetCapacity: this.convertToInt(sfrConfigs.targetCapacity, `${group_name}.targetCapacity`),
        TerminateInstancesWithExpiration: this.convertToBoolean(sfrConfigs.terminateInstancesWithExpiration, `${group_name}.terminateInstancesWithExpiration`),
        Type: this.convertToString(sfrConfigs.type, `${group_name}.type`),
        ValidUntil: this.convertToStringOptional(sfrConfigs.validUntil, `${group_name}.validUntil`),
        TagSpecifications: this.convertTagSpecifications(sfrConfigs.tagSpecifications, `${group_name}.tagSpecifications`),
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

  private isValidSecurityGroup(securityGroup: any): boolean {
    if (!securityGroup || typeof(securityGroup) !== 'object') { return false; }
    // We also verify groupId with convertToString later
    if (!securityGroup.groupId || typeof(securityGroup.groupId) !== 'string') { return false; }
    return true;
  }

  private validateSecurityGroup(securityGroup: any, property: string): void {
    if (!this.isValidSecurityGroup(securityGroup)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertSecurityGroups(securityGroups: any, property: string): InternalSpotFleetSecurityGroupId[] {
    this.validateArray(securityGroups, property);

    const convertedSecurityGroups: InternalSpotFleetSecurityGroupId[] = securityGroups.map((securityGroup: any) => {
      this.validateSecurityGroup(securityGroup, property);
      const convertedSecurityGroup: InternalSpotFleetSecurityGroupId = {
        GroupId: this.convertToString(securityGroup.groupId, `${property}.groupId`),
      };
      return convertedSecurityGroup;
    });

    return convertedSecurityGroups;
  }

  private isValidTagSpecification(tagSpecification: any): boolean {
    if (!tagSpecification || typeof(tagSpecification) !== 'object') { return false; }
    // We also verify resourceType with convertToString later
    if (!tagSpecification.resourceType || typeof(tagSpecification.resourceType) !== 'string') { return false; }
    if (!tagSpecification.tags || !Array.isArray(tagSpecification.tags)) { return false; }
    for (let element of tagSpecification.tags) {
      if (!element || typeof(element) !== 'object') { return false; };
      if (!element.Key || typeof(element.Key) !== 'string' || !element.Value) { return false; }
    }
    return true;
  }

  private validateTagSpecification(tagSpecification: any, property: string): void {
    if (!this.isValidTagSpecification(tagSpecification)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertTagSpecifications(tagSpecifications: any, property: string): InternalSpotFleetTagSpecification[] {
    this.validateArray(tagSpecifications, property);
    const convertedTagSpecifications: InternalSpotFleetTagSpecification[] = tagSpecifications.map((tagSpecification: any) => {
      this.validateTagSpecification(tagSpecification, property);
      const convertedTagSpecification: InternalSpotFleetTagSpecification = {
        ResourceType: this.convertToString(tagSpecification.resourceType, `${property}.resourceType`),
        Tags: tagSpecification.tags,
      };
      return convertedTagSpecification;
    });

    return convertedTagSpecifications;
  }

  private validateDeviceMapping(deviceMapping: any, property: string): void {
    if (!this.isValidDeviceMapping(deviceMapping)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private isValidDeviceMapping(deviceMapping: any): boolean {
    if (!deviceMapping || typeof(deviceMapping) !== 'object') { return false; }
    // We validate the rest properties when convert them.
    // TODO: maybe add for full validation
    return true;
  }

  private convertEbs(ebs: any, property: string): InternalBlockDeviceProperty | undefined {
    if (!ebs) {
      return undefined;
    }

    const convertedEbs: InternalBlockDeviceProperty = {
      DeleteOnTermination: this.convertToBooleanOptional(ebs.deleteOnTermination, `${property}.deleteOnTermination`),
      Encrypted: this.convertToBooleanOptional(ebs.encrypted, `${property}.encrypted`),
      Iops: this.convertToIntOptional(ebs.iops, `${property}.iops`),
      SnapshotId: this.convertToStringOptional(ebs.snapshotId, `${property}.snapshotId`),
      VolumeSize: this.convertToIntOptional(ebs.volumeSize, `${property}.volumeSize`),
      VolumeType: this.convertToStringOptional(ebs.volumeType, `${property}.volumeType`),
    };
    return convertedEbs;
  }

  private convertBlockDeviceMapping(blockDeviceMappings: any, property: string): InternalBlockDeviceMappingProperty[] | undefined {
    if (!blockDeviceMappings) {
      return undefined;
    }

    this.validateArray(blockDeviceMappings, property);
    const convertedBlockDeviceMappings: InternalBlockDeviceMappingProperty[] = blockDeviceMappings.map((deviceMapping: any) => {
      this.validateDeviceMapping(deviceMapping, property);

      const convertedDeviceMapping: InternalBlockDeviceMappingProperty = {
        DeviceName: this.convertToString(deviceMapping.deviceName, `${property}.deviceName`),
        Ebs: this.convertEbs(deviceMapping.ebs, `${property}.ebs`),
        NoDevice: this.convertToBooleanOptional(deviceMapping.noDevice, `${property}.noDevice`),
        VirtualName: this.convertToStringOptional(deviceMapping.virtualName, `${property}.virtualName`),
      };
      return convertedDeviceMapping;
    });
    return convertedBlockDeviceMappings;
  }

  private isValidInstanceProfile(instanceProfile: any): boolean {
    if (!instanceProfile || typeof(instanceProfile) !== 'object') { return false; }
    // We also verify arn with convertToString later
    if (!instanceProfile.arn || typeof(instanceProfile.arn) !== 'string') { return false; }
    return true;
  }

  private validadeInstanceProfile(instanceProfile: any, property: string): void {
    if (!this.isValidInstanceProfile(instanceProfile)) {
      throw new Error(`${property} type is not valid.`);
    }
  }

  private convertInstanceProfile(instanceProfile: any, property: string): InternalSpotFleetInstanceProfile {
    this.validadeInstanceProfile(instanceProfile, property);
    const convertedInstanceProfile: InternalSpotFleetInstanceProfile = {
      Arn: this.convertToString(instanceProfile.arn, `${property}.arn`),
    };
    return convertedInstanceProfile;
  }

  private convertLaunchSpecifications(launchSpecifications: any, property: string): InternalSpotFleetRequestLaunchSpecification[] {
    this.validateArray(launchSpecifications, property);

    const convertedLaunchSpecifications: InternalSpotFleetRequestLaunchSpecification[] = [];
    launchSpecifications.map((launchSpecification: any) => {
      const SecurityGroups = this.convertSecurityGroups(launchSpecification.securityGroups, `${property}.securityGroups`);
      const TagSpecifications = this.convertTagSpecifications(launchSpecification.tagSpecifications, `${property}.tagSpecifications`);
      const BlockDeviceMappings = this.convertBlockDeviceMapping(launchSpecification.blockDeviceMappings, `${property}.blockDeviceMappings`);

      const convertedLaunchSpecification: InternalSpotFleetRequestLaunchSpecification = {
        BlockDeviceMappings,
        IamInstanceProfile: this.convertInstanceProfile(launchSpecification.iamInstanceProfile, `${property}.iamInstanceProfile`),
        ImageId: this.convertToString(launchSpecification.imageId, `${property}.imageId`),
        KeyName: this.convertToStringOptional(launchSpecification.keyName, `${property}.keyName`),
        SecurityGroups,
        SubnetId: this.convertToStringOptional(launchSpecification.subnetId, `${property}.subnetId`),
        TagSpecifications,
        UserData: this.convertToString(launchSpecification.userData, `${property}.userData`),
        InstanceType: this.convertToString(launchSpecification.instanceType, `${property}.instanceType`),
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
  private convertSpotEventPluginSettings(pluginOptions: InternalSpotEventPluginSettings): InternalSpotEventPluginSettings {
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

  private toPluginPropertyArray(input: InternalSpotEventPluginSettings): PluginProperty[] {
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
