/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import { SpotEventPluginClient } from '../lib/configure-spot-event-plugin';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import { DeadlineClient } from '../lib/deadline-client';
import {
  isArn as isSecretArn,
  readCertificateData,
} from '../lib/secrets-manager';
import {
  convertSpotFleetRequestConfiguration,
  convertSpotEventPluginSettings,
} from './conversion';
import {
  ConnectionOptions,
  PluginSettings,
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

    if (!await spotEventPluginClient.addGroups(resourceProperties.deadlineGroups)) {
      throw new Error(`Failed to add Deadline group(s) ${resourceProperties.deadlineGroups}`);
    }

    if (!await spotEventPluginClient.addPools(resourceProperties.deadlinePools)) {
      throw new Error(`Failed to add Deadline pool(s) ${resourceProperties.deadlinePools}`);
    }

    if (resourceProperties.spotFleetRequestConfigurations) {
      const convertedSpotFleetRequestConfigs = convertSpotFleetRequestConfiguration(resourceProperties.spotFleetRequestConfigurations);
      const stringConfigs = JSON.stringify(convertedSpotFleetRequestConfigs);
      const response = await spotEventPluginClient.saveServerData(stringConfigs);
      if (!response) {
        throw new Error('Failed to save spot fleet request with configuration');
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const convertedSpotPluginConfigs = convertSpotEventPluginSettings(resourceProperties.spotPluginConfigurations);
      const pluginSettings = this.toKeyValueArray(convertedSpotPluginConfigs);
      const securitySettings = this.securitySettings();
      const response = await spotEventPluginClient.configureSpotEventPlugin([...pluginSettings, ...securitySettings]);
      if (!response) {
        throw new Error('Failed to save Spot Event Plugin Configurations');
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
    if (!value || typeof(value) !== 'object' || Array.isArray(value)) { return false; }
    if (!this.implementsConnectionOptions(value.connection)) { return false; }
    return true;
  }

  private implementsConnectionOptions(value: any): value is ConnectionOptions {
    if (!value || typeof(value) !== 'object' || Array.isArray(value)) { return false; }
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
    // The calculation of retries is approximate. The real number of retries will be smaller,
    // because we quit Lambda before the timeout (see SimpleCustomResource implementation).
    const lambdaTimeoutMins = parseInt(process.env.LAMBDA_TIMEOUT_MINS || '15'); // The maximum Lambda execution time is 15 mins.
    const MS_IN_A_MINUTE = 60000;
    const timeRemaining = lambdaTimeoutMins * MS_IN_A_MINUTE;
    const retryWaitMs = 10000;
    const retries = Math.floor(timeRemaining / retryWaitMs);

    return new SpotEventPluginClient(new DeadlineClient({
      host: connection.hostname,
      port: Number.parseInt(connection.port, 10),
      protocol: connection.protocol,
      tls: {
        ca: connection.caCertificateArn ? await readCertificateData(connection.caCertificateArn, this.secretsManagerClient) : undefined,
      },
      retries,
      retryWaitMs,
    }));
  }

  private toKeyValueArray(input: PluginSettings): Array<{ Key: string, Value: any }> {
    const configs: Array<{ Key: string, Value: any }> = [];
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

  private securitySettings(): Array<{ Key: string, Value: any }> {
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
