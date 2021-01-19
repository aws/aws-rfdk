/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { SEPGeneralOptions } from '../../nodejs/lib/sep-configuration';
import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import { DeadlineClient } from '../lib/deadline-client';
import { Secret } from '../lib/secrets-manager';
import { EventPluginRequests } from '../lib/sep-configuration';

export interface IConnectionOptions {
  /**
   * FQDN of the host to connect to.
   */
  readonly hostname: string;

  /**
   * Port on the host.
   */
  readonly port: number;

  /**
   * Content of the CA certificate
   */
  readonly caCertificate?: string;

  /**
   * Content of the PFX certificate.
   */
  readonly pfxCertificate?: string;

  /**
   * Shared passphrase used for a single private key and/or a PFX.
   */
  readonly passphrase?: string;
}

/**
 * The input to this Custom Resource
 */
export interface ISEPConfiguratorResourceProperties {
  /**
   * Connection info for logging into the server.
   */
  readonly connection: IConnectionOptions;

  /**
   * TODO: used to save spot fleet request configuration
   */
  readonly spotFleetRequestConfigurations?: string;

  /**
   * TODO: used to save group/pools and general settings
   */
  readonly spotPluginConfigurations?: SEPGeneralOptions;
}

/**
 * TODO: add description
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
    return this.implementsISEPConfiguratorResourceProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: ISEPConfiguratorResourceProperties): Promise<object|undefined> { // TODO: for now this return type
    // TODO: this is ugly. Maybe also use TLSProps inside ?
    let useTLS: boolean = false;
    if (resourceProperties.connection.caCertificate || resourceProperties.connection.pfxCertificate || resourceProperties.connection.passphrase) {
      useTLS = true;
    }

    const eventPluginRequests = new EventPluginRequests(new DeadlineClient({
      host: resourceProperties.connection.hostname,
      port: resourceProperties.connection.port,
      tls: (useTLS ? {
        ca: resourceProperties.connection.caCertificate,
        pfx: resourceProperties.connection.pfxCertificate,
        passphrase: resourceProperties.connection.passphrase,
      } : undefined),
    }));

    if (resourceProperties.spotFleetRequestConfigurations) {
      const response = await eventPluginRequests.saveServerData(resourceProperties.spotFleetRequestConfigurations);
      if (!response) {
        console.log('Failed to save spot fleet request.');
      }
    }
    if (resourceProperties.spotPluginConfigurations) {
      const response = await eventPluginRequests.configureSpotEventPlugin(resourceProperties.spotPluginConfigurations);
      if (!response) {
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