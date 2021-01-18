/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import {
  Secret,
} from '../lib/secrets-manager';

// TODO: remove this, we will import it properly
export class EventPluginRequests {
  constructor() {}

  public async saveServerData(): Promise<boolean> {
    return true;
  }

  public async saveSpotFleetRequestData(): Promise<boolean> {
    return true;
  }
}

/**
 * The input to this Custom Resource
 */
export interface ISEPConfiguratorResourceProperties {
  /**
   * TODO: used to save spot fleet request configuration
   */
  readonly spotFleetRequestConfiguration: string;

  /**
   * TODO: used to save group/pools and general settings
   */
  readonly spotPluginConfigurations: string;
}

/**
 * TODO: add description
 */
export class SEPConfiguratorResource extends SimpleCustomResource {
  readonly eventPluginRequests = new EventPluginRequests();
  protected readonly secretsManagerClient: SecretsManager;

  constructor(secretsManagerClient: SecretsManager) {
    super();
    this.secretsManagerClient = secretsManagerClient;
  }

  /**
   * @inheritdoc
   */
  public validateInput(data: object): boolean {
    return this.implementsISEPConfiguratorResourceProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: ISEPConfiguratorResourceProperties): Promise<object|undefined> { // TODO: for now this return type
    if (resourceProperties.spotFleetRequestConfiguration) {
      const response = await this.eventPluginRequests.saveSpotFleetRequestData();
      // TODO: parse response or if it's done inside of eventPluginRequests class - then just check if it was successful.
      if (!response) {
        console.log('Failed to save spot fleet request.');
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const response = await this.eventPluginRequests.saveServerData();
      if (!response) {
        // TODO: parse response or if it's done inside of eventPluginRequests class - then just check if it was successful.
        console.log('Failed to save server data');
      }
    }
    return undefined;
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: ISEPConfiguratorResourceProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  // TODO: add more checks
  private implementsISEPConfiguratorResourceProperties(value: any): boolean {
    if (!value || typeof(value) !== 'object') { return false; }

    if (value.spotFleets) {
      if (!Array.isArray(value.spotFleets) || value.spotFleets) { return false; }
    }
    if (value.idleShutdown && typeof(value.idleShutdown) !== 'number') { return false; }
    return true;
  }

  /**
   * Retrieve CA certificate data from the Secret with the given ARN.
   * @param certificateArn
   */
  protected async readCertificateData(certificateArn: string): Promise<string> {
    const data = await Secret.fromArn(certificateArn, this.secretsManagerClient).getValue();
    if (Buffer.isBuffer(data) || !/BEGIN CERTIFICATE/.test(data as string)) {
      throw new Error(`CA Certificate Secret (${certificateArn}) must contain a Certificate in PEM format.`);
    }
    return data as string;
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