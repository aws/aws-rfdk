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
  InternalSpotEventPluginSettings,
  SEPConfiguratorResourceProps,
} from './types';

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
      const confiArray = this.toKeyValueArray(convertedSpotPluginConfigs);
      const response = await spotEventPluginClient.configureSpotEventPlugin(confiArray);
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
  private convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: object): object {
    // TODO: all properties have to be capitalized and maybe converted
    const convertedSpotFleetRequestConfigs: any = {};
    for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
      const convertedLaunchSpecifications: any = [];
      sfrConfigs.launchSpecifications.map((launchSpecification: any) => {
        const convertedSecurityGroups = launchSpecification.securityGroups.map((securityGroup: any) => {
          return {
            GroupId: securityGroup.groupId,
          };
        });

        const convertedTagSpecifications = launchSpecification.tagSpecifications.map((tagSpecification: any) => {
          return {
            ResourceType: tagSpecification.resourceType,
            Tags: tagSpecification.tags,
          };
        });

        let convertedBlockDeviceMappings;
        if (launchSpecification.blockDeviceMappings) {
          convertedBlockDeviceMappings = launchSpecification.blockDeviceMappings.map((deviceMapping: any) => {
            const convertedEbs = deviceMapping.ebs ? {
              DeleteOnTermination: this.convertToBoolean('deviceMapping.ebs.deleteOnTermination', deviceMapping.ebs.deleteOnTermination),
              Encrypted: this.convertToBoolean('deviceMapping.ebs.encrypted', deviceMapping.ebs.encrypted),
              Iops: this.convertToInt('deviceMapping.ebs.iops', deviceMapping.ebs.iops),
              SnapshotId: deviceMapping.ebs.snapshotId,
              VolumeSize: this.convertToInt('deviceMapping.ebs.volumeSize', deviceMapping.ebs.volumeSize),
              VolumeType: deviceMapping.ebs.volumeType,
            } : undefined;

            return {
              DeviceName: deviceMapping.deviceName,
              Ebs: convertedEbs,
              NoDevice: this.convertToBoolean('deviceMapping.noDevice', deviceMapping.noDevice),
              VirtualName: deviceMapping.virtualName,
            };
          });
        }

        const convertedLaunchSpecification = {
          BlockDeviceMappings: convertedBlockDeviceMappings,
          IamInstanceProfile: {
            Arn: launchSpecification.iamInstanceProfile.arn,
          },
          ImageId: launchSpecification.imageId,
          KeyName: launchSpecification.keyName,
          SecurityGroups: convertedSecurityGroups,
          SubnetId: launchSpecification.subnetId,
          TagSpecifications: convertedTagSpecifications,
          UserData: launchSpecification.userData,
          InstanceType: launchSpecification.instanceType,
        };
        convertedLaunchSpecifications.push(convertedLaunchSpecification);
      });

      const convertedTagSpecifications = sfrConfigs.tagSpecifications.map((tagSpecification: any) => {
        return {
          ResourceType: tagSpecification.resourceType,
          Tags: tagSpecification.tags,
        };
      });

      convertedSpotFleetRequestConfigs[group_name] = {
        AllocationStrategy: sfrConfigs.allocationStrategy,
        IamFleetRole: sfrConfigs.iamFleetRole,
        LaunchSpecifications: convertedLaunchSpecifications,
        ReplaceUnhealthyInstances: this.convertToBoolean('replaceUnhealthyInstances', sfrConfigs.replaceUnhealthyInstances),
        TargetCapacity: this.convertToInt('targetCapacity', sfrConfigs.targetCapacity),
        TerminateInstancesWithExpiration: this.convertToBoolean('terminateInstancesWithExpiration', sfrConfigs.terminateInstancesWithExpiration),
        Type: sfrConfigs.type,
        ValidUntil: sfrConfigs.validUntil,
        TagSpecifications: convertedTagSpecifications,
      };
    }
    return convertedSpotFleetRequestConfigs;
  }


  private convertToInt(property: string, value?: any): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof(value) === 'number') {
      if (Number.isInteger(value)) {
        return value;
      }
    }

    if (typeof(value) === 'string') {
      const result = Number.parseInt(value, 10);
      if (!Number.isNaN(result) && Number.isInteger(result)) {
        return result;
      }
    }

    throw new Error(`The value of ${property} should be an integer. Received: ${value}`);
  }

  private convertToBoolean(property: string, value?: any): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof(value) === 'boolean') {
      return value;
    }

    if (typeof(value) === 'string') {
      try {
        return JSON.parse(value);
      } catch(e) {
        // we can skip here as we throw an error with a more descriptive message later
      }
    }

    throw new Error(`The value of ${property} should be a boolean. Received: ${value}`);
  }

  /**
   * Convert the configuration we received from ConfigureSpotEventPlugin construct to the fromat
   * expected by the Spot Event Plugin. This requires renaming (often just capitalizing) properties, but also
   * boolean and number properties get converted into strings when passed to this custom resource,
   * so we need to restore the original types.
   */
  private convertSpotEventPluginSettings(pluginOptions: InternalSpotEventPluginSettings): object {
    return {
      AWSInstanceStatus: pluginOptions.awsInstanceStatus,
      DeleteInterruptedSlaves: this.convertToBoolean('deleteEC2SpotInterruptedWorkers', pluginOptions.deleteEC2SpotInterruptedWorkers),
      DeleteTerminatedSlaves: this.convertToBoolean('deleteSEPTerminatedWorkers', pluginOptions.deleteSEPTerminatedWorkers),
      IdleShutdown: this.convertToInt('idleShutdown', pluginOptions.idleShutdown),
      Logging: pluginOptions.loggingLevel,
      PreJobTaskMode: pluginOptions.preJobTaskMode,
      Region: pluginOptions.region,
      ResourceTracker: this.convertToBoolean('enableResourceTracker', pluginOptions.enableResourceTracker),
      StaggerInstances: this.convertToInt('maximumInstancesStartedPerCycle', pluginOptions.maximumInstancesStartedPerCycle),
      State: pluginOptions.state,
      StrictHardCap: this.convertToBoolean('strictHardCap', pluginOptions.strictHardCap),
      UseLocalCredentials: true,
      NamedProfile: '',
    };
  }

  private toKeyValueArray(input: object) {
    const configs: { Key: string, Value: any }[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        configs.push({
          Key: key,
          Value: value,
        });
      }
    }
    return configs;
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
