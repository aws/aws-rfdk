/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import { EventPluginRequests } from '../lib/configure-spot-event-plugin';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import { DeadlineClient } from '../lib/deadline-client';
import {
  isArn as isSecretArn,
  readCertificateData,
} from '../lib/secrets-manager';

export interface ConnectionOptions {
  /**
   * FQDN of the host to connect to.
   */
  readonly hostname: string;

  /**
   * Port on the host.
   */
  readonly port: string;

  /**
   * Protocol used to connect to the host.
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
export interface SEPConfiguratorResourceProperties {
  /**
   * Connection info for logging into the server.
   */
  readonly connection: ConnectionOptions;

  /**
   * A JSON string containing the Spot Fleet Request Configurations.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html?highlight=spot%20even%20plugin#example-spot-fleet-request-configurations
   */
  readonly spotFleetRequestConfigurations?: object;

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html?highlight=spot%20even%20plugin#event-plugin-configuration-options
   */
  readonly spotPluginConfigurations?: object;
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
    return this.implementsSEPConfiguratorResourceProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: SEPConfiguratorResourceProperties): Promise<object|undefined> {
    const eventPluginRequests = await this.spotEventPluginRequests(resourceProperties.connection);

    if (resourceProperties.spotFleetRequestConfigurations) {
      const stringConfigs = this.spotFleetRequestToString(resourceProperties.spotFleetRequestConfigurations);
      const response = await eventPluginRequests.saveServerData(stringConfigs);
      if (!response) {
        console.log(`Failed to save spot fleet request with configuration: ${stringConfigs}`);
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const spotEventFleetPluginConfigs = this.spotFleetPluginConfigsToArray(resourceProperties.spotPluginConfigurations);
      const response = await eventPluginRequests.configureSpotEventPlugin(spotEventFleetPluginConfigs);
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
  public async doDelete(physicalId: string, resourceProperties: SEPConfiguratorResourceProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  private implementsSEPConfiguratorResourceProperties(value: any): value is SEPConfiguratorResourceProperties {
    if (!value || typeof(value) !== 'object') { return false; }
    if (!this.implementsConnectionOptions(value.connection)) { return false; }
    if (!this.isValidSFRConfig(value.spotFleetRequestConfigurations)) { return false; }
    if (!this.isValidSpotPluginConfig(value.spotPluginConfigurations)) { return false; }
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

  private isValidSFRConfig(value: any): boolean {
    if (!value) { return true; }
    if (typeof(value) !== 'object') { return false; }
    if (Array.isArray(value)) { return false; }
    return true;
  }

  private isValidSpotPluginConfig(value: any): boolean {
    if (!value) { return true; }
    if (typeof(value) !== 'object') { return false; }
    if (Array.isArray(value)) { return false; }

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

  private convertToBoolean(input: string): boolean | undefined {
    try {
      return JSON.parse(input);
    } catch(e) {
      return undefined;
    }
  }

  /**
   * Passing spot fleet request configs into lambda converts all numbers and booleans into strings.
   * This functions converts these values back to their original type.
   */
  private spotFleetRequestToString(spotFleetRequestConfigs: object): string {
    let convertedSpotFleetRequestConfigs = spotFleetRequestConfigs;
    for (const [_, sfrConfigs] of Object.entries(convertedSpotFleetRequestConfigs)) {
      if ('TargetCapacity' in sfrConfigs) {
        sfrConfigs.TargetCapacity = Number.parseInt(sfrConfigs.TargetCapacity, 10);
      }
      if ('ReplaceUnhealthyInstances' in sfrConfigs) {
        sfrConfigs.ReplaceUnhealthyInstances = this.convertToBoolean(sfrConfigs.ReplaceUnhealthyInstances);
      }
      if ('TerminateInstancesWithExpiration' in sfrConfigs) {
        sfrConfigs.TerminateInstancesWithExpiration = this.convertToBoolean(sfrConfigs.TerminateInstancesWithExpiration);
      }
      if ('LaunchSpecifications' in sfrConfigs) {
        sfrConfigs.LaunchSpecifications.map((launchSpecification: any) => {
          if ('BlockDeviceMappings' in launchSpecification) {
            launchSpecification.BlockDeviceMappings.map((blockDeviceMapping: any) => {
              if ('noDevice' in blockDeviceMapping) {
                blockDeviceMapping.noDevice = this.convertToBoolean(blockDeviceMapping.noDevice);
              }
              if ('ebs' in blockDeviceMapping) {
                if ('deleteOnTermination' in blockDeviceMapping.ebs) {
                  blockDeviceMapping.ebs.deleteOnTermination = this.convertToBoolean(blockDeviceMapping.ebs.deleteOnTermination);
                }
                if ('encrypted' in blockDeviceMapping.ebs) {
                  blockDeviceMapping.ebs.encrypted = this.convertToBoolean(blockDeviceMapping.ebs.encrypted);
                }
                if ('iops' in blockDeviceMapping.ebs) {
                  blockDeviceMapping.ebs.iops = Number.parseInt(blockDeviceMapping.ebs.iops, 10);
                }
                if ('volumeSize' in blockDeviceMapping.ebs) {
                  blockDeviceMapping.ebs.volumeSize = Number.parseInt(blockDeviceMapping.ebs.volumeSize, 10);
                }
              }
            });
          }
        });
      }
    }
    return JSON.stringify(convertedSpotFleetRequestConfigs);
  }

  private spotFleetPluginConfigsToArray(pluginOptions: any): any {
    // TODO: ...pluginOptions didn't work
    let convertedConfigs = pluginOptions;
    if ('DeleteInterruptedSlaves' in convertedConfigs) {
      convertedConfigs.DeleteInterruptedSlaves = this.convertToBoolean(convertedConfigs.DeleteInterruptedSlaves);
    }
    if ('DeleteTerminatedSlaves' in convertedConfigs) {
      convertedConfigs.DeleteTerminatedSlaves = this.convertToBoolean(convertedConfigs.DeleteTerminatedSlaves);
    }
    if ('IdleShutdown' in convertedConfigs) {
      convertedConfigs.IdleShutdown = Number.parseInt(convertedConfigs.IdleShutdown, 10);
    }
    if ('ResourceTracker' in convertedConfigs) {
      convertedConfigs.ResourceTracker = this.convertToBoolean(convertedConfigs.ResourceTracker);
    }
    if ('StaggerInstances' in convertedConfigs) {
      convertedConfigs.StaggerInstances = this.convertToBoolean(convertedConfigs.StaggerInstances);
    }
    if ('StrictHardCap' in convertedConfigs) {
      convertedConfigs.StrictHardCap = this.convertToBoolean(convertedConfigs.StrictHardCap);
    }

    const configs: { Key: string, Value: any }[] = [
      {
        Key: 'UseLocalCredentials',
        Value: true,
      },
      {
        Key: 'NamedProfile',
        Value: '',
      },
    ];
    for (const [key, value] of Object.entries(pluginOptions)) {
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
