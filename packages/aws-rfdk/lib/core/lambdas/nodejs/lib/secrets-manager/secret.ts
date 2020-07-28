/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';

import { Key } from '../kms';
import { isArn } from './validation';

export function sanitizeSecretName(name: string): string {
  // The secret name must be ASCII letters, digits, or the following characters : /_+=.@-
  return name.replace(/[^A-Za-z0-9/_+=.@-]/g, '');
}

export class Secret {
  public static readonly API_VERSION = '2017-10-17';

  public static fromArn(arn: string, client: SecretsManager) {
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
    client: SecretsManager,
    encryptionKey?: Key,
    description?: string,
    data?: Buffer | string,
    tags?: Array<{ Key: string, Value: string }>
  }): Promise<Secret | undefined> {
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SecretsManager.html#createSecret-property
    const request: SecretsManager.CreateSecretRequest = {
      Name: args.name,
      Description: args.description,
      KmsKeyId: args.encryptionKey?.arn,
      Tags: args.tags,
      SecretString: (typeof args.data === 'string') ? args.data : undefined,
      SecretBinary: Buffer.isBuffer(args.data) ? args.data : undefined,
    };
    try {
      const response: SecretsManager.CreateSecretResponse = await args.client.createSecret(request).promise();
      console.debug(`CreateSecret response: ${JSON.stringify(response)}`);
      if (response.ARN) {
        return Secret.fromArn(response.ARN, args.client);
      }
      return undefined;
    } catch (e) {
      throw new Error(`CreateSecret '${args.name}' failed in region '${args.client.config.region}': ` +
        `${e.code} -- ${e.message}`);
    }
  }

  // Undefined only if the Secret has been deleted.
  public arn: string | undefined;
  protected readonly client: SecretsManager;

  protected constructor(arn: string, client: SecretsManager) {
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
    const request: SecretsManager.DeleteSecretRequest = {
      SecretId: this.arn,
      ForceDeleteWithoutRecovery: force,
    };
    try {
      console.debug(`Deleting Secret: ${this.arn}`);
      const response: SecretsManager.DeleteSecretResponse =
                await this.client.deleteSecret(request).promise();
      console.debug(`DeleteSecret response: ${JSON.stringify(response)}`);
      this.arn = undefined;
    } catch (e) {
      throw new Error(`DeleteSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${e.code} -- ${e.message}`);
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
    const request: SecretsManager.PutSecretValueRequest = {
      SecretId: this.arn,
      SecretString: (typeof data === 'string') ? data : undefined,
      SecretBinary: Buffer.isBuffer(data) ? data : undefined,
    };
    try {
      const response: SecretsManager.PutSecretValueResponse =
                await this.client.putSecretValue(request).promise();
      console.debug(`PutSecret response: ${JSON.stringify(response)}`);
    } catch (e) {
      throw new Error(`PutSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${e.code} -- ${e.message}`);
    }
  }

  /**
   * Get the latest version of the data stored in the secret.
   */
  public async getValue(): Promise<string | Buffer | undefined> {
    if (!this.arn) {
      throw Error('Secret has been deleted');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SecretsManager.html#getSecretValue-property
    const request: SecretsManager.GetSecretValueRequest = {
      SecretId: this.arn,
    };
    try {
      const response: SecretsManager.GetSecretValueResponse =
                await this.client.getSecretValue(request).promise();
      if (response.SecretBinary) {
        // SecretBinary can be: Buffer|Uint8Array|Blob|string
        const data = response.SecretBinary;
        if (Buffer.isBuffer(data)) {
          return data;
        } else if (typeof data === 'string') {
          return Buffer.from(data, 'binary');
        } else if (ArrayBuffer.isView(data)) {
          return Buffer.from(data);
        } else {
          throw new Error('Unknown type for SecretBinary data');
        }
      }
      return response.SecretString;
    } catch (e) {
      throw new Error(`GetSecret '${this.arn}' failed in region '${this.client.config.region}':` +
        `${e.code} -- ${e.message}`);
    }
  }
}