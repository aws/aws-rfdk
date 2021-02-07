/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { Secret } from './secret';

/**
 * Retrieve certificate data from the Secret with the given ARN.
 * @param arn ARN of the Secret containing the certificate
 * @param client An instance of the SecretsManager class
 */
export async function readCertificateData(arn: string, client: SecretsManager): Promise<string> {
  const data = await Secret.fromArn(arn, client).getValue();
  if (Buffer.isBuffer(data) || !/BEGIN CERTIFICATE/.test(data as string)) {
    throw new Error(`Certificate Secret (${arn}) must contain a Certificate in PEM format.`);
  }
  return data as string;
}