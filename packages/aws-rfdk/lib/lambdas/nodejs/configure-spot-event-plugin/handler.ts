/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { CfnLaunchConfiguration } from '@aws-cdk/aws-autoscaling';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import {
  SpotFleetSecurityGroupId,
  SpotFleetRequestConfiguration,
  SpotFleetTagSpecification,
  SpotEventPluginSettings,
  SpotEventPluginAwsInstanceStatus,
  SpotEventPluginState,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginLoggingLevel,
} from '../../../deadline';
import { LambdaContext } from '../lib/aws-lambda';
import { EventPluginRequests } from '../lib/configure-spot-event-plugin';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import { DeadlineClient } from '../lib/deadline-client';
import {
  isArn as isSecretArn,
  readCertificateData,
} from '../lib/secrets-manager';
import {
  ConnectionOptions,
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
  // @ts-ignore -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: SEPConfiguratorResourceProps): Promise<object|undefined> {
    const eventPluginRequests = await this.spotEventPluginRequests(resourceProperties.connection);

    if (resourceProperties.spotFleetRequestConfigurations) {
      const convertedSpotFleetRequestConfigs = this.convertSpotFleetRequestConfiguration(resourceProperties.spotFleetRequestConfigurations);
      const stringConfigs = JSON.stringify(convertedSpotFleetRequestConfigs);
      const response = await eventPluginRequests.saveServerData(stringConfigs);
      if (!response) {
        console.log(`Failed to save spot fleet request with configuration: ${stringConfigs}`);
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const convertedSpotPluginConfigs = this.convertSpotEventPluginSettings(resourceProperties.spotPluginConfigurations);
      const confiArray = this.toKeyValueArray(convertedSpotPluginConfigs);
      const response = await eventPluginRequests.configureSpotEventPlugin(confiArray);
      if (!response) {
        console.log(`Failed to save Spot Event Plugin Configurations: ${resourceProperties.spotPluginConfigurations}`);
      }
    }
    return undefined;
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: SEPConfiguratorResourceProps): Promise<void> {
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

  private async spotEventPluginRequests(connection: ConnectionOptions): Promise<EventPluginRequests> {
    return new EventPluginRequests(new DeadlineClient({
      host: connection.hostname,
      port: Number.parseInt(connection.port, 10),
      protocol: connection.protocol,
      tls: {
        ca: connection.caCertificateArn ? await readCertificateData(connection.caCertificateArn, this.secretsManagerClient) : undefined,
      },
    }));
  }

  /**
   * TODO: add proper description
   */
  private convertSpotFleetRequestConfiguration(spotFleetRequestConfigs: SpotFleetRequestConfiguration): any {
    // TODO: all properties have to be capitalized and maybe converted
    const convertedSpotFleetRequestConfigs: any = {};
    for (const [group_name, sfrConfigs] of Object.entries(spotFleetRequestConfigs)) {
      const convertedLaunchSpecifications: any = [];
      sfrConfigs.launchSpecifications.map(launchSpecification => {
        const convertedSecurityGroups = (launchSpecification.securityGroups as SpotFleetSecurityGroupId[]).map(securityGroup => {
          return {
            GroupId: securityGroup.groupId,
          };
        });

        const convertedTagSpecifications = (launchSpecification.tagSpecifications as SpotFleetTagSpecification[]).map(tagSpecification => {
          return {
            ResourceType: tagSpecification.resourceType.toString(),
            Tags: tagSpecification.tags,
          };
        });

        let convertedBlockDeviceMappings;
        if (launchSpecification.blockDeviceMappings) {
          convertedBlockDeviceMappings = (launchSpecification.blockDeviceMappings as CfnLaunchConfiguration.BlockDeviceMappingProperty[])
            .map(deviceMapping => {
              const convertedEbs = deviceMapping.ebs ? {
                DeleteOnTermination: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).deleteOnTermination,
                Encrypted: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).encrypted,
                Iops: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).iops,
                SnapshotId: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).snapshotId,
                VolumeSize: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).volumeSize,
                VolumeType: (deviceMapping.ebs as CfnLaunchConfiguration.BlockDeviceProperty).volumeType,
              } : undefined;

              return {
                DeviceName: deviceMapping.deviceName,
                Ebs: convertedEbs,
                NoDevice: deviceMapping.noDevice,
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
          InstanceType: launchSpecification.instanceType.toString(), // TODO: add ?
        };
        convertedLaunchSpecifications.push(convertedLaunchSpecification);
      });

      const convertedTagSpecifications = (sfrConfigs.tagSpecifications as SpotFleetTagSpecification[]).map(tagSpecification => {
        return {
          ResourceType: tagSpecification.resourceType.toString(),
          Tags: tagSpecification.tags,
        };
      });

      convertedSpotFleetRequestConfigs[group_name] = {
        AllocationStrategy: sfrConfigs.allocationStrategy,
        IamFleetRole: sfrConfigs.iamFleetRole,
        LaunchSpecifications: convertedLaunchSpecifications,
        ReplaceUnhealthyInstances: sfrConfigs.replaceUnhealthyInstances,
        TargetCapacity: sfrConfigs.targetCapacity,
        TerminateInstancesWithExpiration: sfrConfigs.terminateInstancesWithExpiration,
        Type: sfrConfigs.type,
        ValidUntil: sfrConfigs.validUntil,
        TagSpecifications: convertedTagSpecifications,
      };
    }
    return convertedSpotFleetRequestConfigs;
  }

  /**
   * TODO: add proper description
   */
  private convertSpotEventPluginSettings(pluginOptions: SpotEventPluginSettings): object {
    return {
      AWSInstanceStatus: (pluginOptions.awsInstanceStatus ?? SpotEventPluginAwsInstanceStatus.DISABLED).toString(),
      DeleteInterruptedSlaves: pluginOptions.deleteEC2SpotInterruptedWorkers ?? false,
      DeleteTerminatedSlaves: pluginOptions.deleteSEPTerminatedWorkers ?? false,
      IdleShutdown: pluginOptions.idleShutdown ?? 10,
      Logging: (pluginOptions.loggingLevel ?? SpotEventPluginLoggingLevel.STANDARD).toString(),
      PreJobTaskMode: (pluginOptions.preJobTaskMode ?? SpotEventPluginPreJobTaskMode.CONSERVATIVE).toString(),
      // we always set region in ConfigureSpotEventPlugin construct, so this default shouldn't be used during deployment
      Region: pluginOptions.region ?? 'eu-west-1',
      ResourceTracker: pluginOptions.enableResourceTracker ?? true,
      StaggerInstances: pluginOptions.maximumInstancesStartedPerCycle ?? 50,
      State: (pluginOptions.state ?? SpotEventPluginState.DISABLED).toString(),
      StrictHardCap: pluginOptions.strictHardCap ?? false,
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
