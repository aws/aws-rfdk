/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { isUint8Array } from 'util/types';
/* eslint-disable import/no-extraneous-dependencies */
import {
  CreateSecretCommand,
  CreateSecretRequest,
  CreateSecretResponse,
  DeleteSecretCommand,
  DeleteSecretRequest,
  DeleteSecretResponse,
  GetSecretValueCommand,
  GetSecretValueRequest,
  GetSecretValueResponse,
  PutSecretValueCommand,
  PutSecretValueRequest,
  PutSecretValueResponse,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
/* eslint-enable import/no-extraneous-dependencies */

import { Key } from '../kms';
import { isArn } from './validation';

export function sanitizeSecretName(name: string): string {
  // The secret name must be ASCII letters, digits, or the following characters : /_+=.@-
  return name.replace(/[^A-Za-z0-9/_+=.@-]/g, '');
}

export class Secret {
  public static readonly API_VERSION = '2017-10-17';

  public static fromArn(arn: string, client: SecretsManagerClient) {
    if (!isArn(arn)) {
      throw Error(`Not a Secret ARN: ${arn}`);
    }
    return new Secret(arn, client);
  }

  /**
   * Creates a Secret with the given name and, optionally, containing the given 'data'. Tags the
   * secret with the given 'tags' if provided.
   * @param args
   * @throws Error if the request fails.
   * @returns A new Secret object for the newly created secret.
   */
  public static async create(args: {
    name: string,
    client: SecretsManagerClient,
    encryptionKey?: Key,
    description?: string,
    data?: Buffer | string,
    tags?: Array<{ Key: string, Value: string }>
  }): Promise<Secret | undefined> {
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SecretsManager.html#createSecret-property
    const request: CreateSecretRequest = {
      Name: args.name,
      Description: args.description,
      KmsKeyId: args.encryptionKey?.arn,
      Tags: args.tags,
      SecretString: (typeof args.data === 'string') ? args.data : undefined,
      SecretBinary: Buffer.isBuffer(args.data) ? args.data : undefined,
    };
    try {
      const response: CreateSecretResponse = await args.client.send(new CreateSecretCommand(request));
      console.debug(`CreateSecret response: ${JSON.stringify(response)}`);
      if (response.ARN) {
        return Secret.fromArn(response.ARN, args.client);
      }
      return undefined;
    } catch (e) {
      throw new Error(`CreateSecret '${args.name}' failed in region '${args.client.config.region}': ` +
        `${(e as Error)?.name} -- ${(e as Error)?.message}`);
    }
  }

  // Undefined only if the Secret has been deleted.
  public arn: string | undefined;
  protected readonly client: SecretsManagerClient;

  protected constructor(arn: string, client: SecretsManagerClient) {
    this.client = client;
    this.arn = arn;
  }

  /**
   * Deletes this Secret in AWS SecretsManager
   * @param force If true, then force the delete with no recovery.
   * @throws Error if the request fails.
   */
  public async delete(force?: boolean): Promise<void> {
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SecretsManager.html#deleteSecret-property
    if (!this.arn) {
      throw Error('Secret has already been deleted');
    }
    const request: DeleteSecretRequest = {
      SecretId: this.arn,
      ForceDeleteWithoutRecovery: force,
    };
    try {
      console.debug(`Deleting Secret: ${this.arn}`);
      const response: DeleteSecretResponse =
                await this.client.send(new DeleteSecretCommand(request));
      console.debug(`DeleteSecret response: ${JSON.stringify(response)}`);
      this.arn = undefined;
    } catch (e) {
      throw new Error(`DeleteSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${(e as Error)?.name} -- ${(e as Error)?.message}`);
    }
  }

  /**
   * Store the given 'data' in the Secret. Text is stored in the 'SecretString'
   * of the Secret, whereas bytes are stored base64-encoded in the 'SecretBinary'
   * of the Secret.
   * @param data
   * @throws Error if the request fails.
   */
  public async putValue(data: string | Buffer): Promise<void> {
    if (!this.arn) {
      throw Error('Secret has been deleted');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SecretsManager.html#putSecretValue-property
    const request: PutSecretValueRequest = {
      SecretId: this.arn,
      SecretString: (typeof data === 'string') ? data : undefined,
      SecretBinary: Buffer.isBuffer(data) ? data : undefined,
    };
    try {
      const response: PutSecretValueResponse =
                await this.client.send(new PutSecretValueCommand(request));
      console.debug(`PutSecret response: ${JSON.stringify(response)}`);
    } catch (e) {
      throw new Error(`PutSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${(e as Error)?.name} -- ${(e as Error)?.message}`);
    }
  }

  /**
   * Get the latest version of the data stored in the secret.
   */
  public async getValue(): Promise<string | Buffer | undefined> {
    if (!this.arn) {
      throw Error('Secret has been deleted');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/GetSecretValueCommand/
    const request: GetSecretValueRequest = {
      SecretId: this.arn,
    };
    try {
      const response: GetSecretValueResponse =
                await this.client.send(new GetSecretValueCommand(request));
      if (response.SecretBinary) {
        // SecretBinary is expected to be a Uint8Array
        const data = response.SecretBinary;
        if (isUint8Array(data)) {
          return Buffer.from(data);
        } else {
          throw new Error('Unknown type for SecretBinary data');
        }
      }
      return response.SecretString;
    } catch (e) {
      throw new Error(`GetSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${(e as Error)?.name} -- ${(e as Error)?.message}`);
    }
  }
}
