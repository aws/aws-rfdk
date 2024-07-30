/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { readCertificateData } from '../read-certificate';

const secretPartialArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

// @ts-ignore
async function successRequestMock(request: { [key: string]: string}, returnValue: any): Promise<{ [key: string]: any }> {
  return returnValue;
}

describe('readCertificateData', () => {
  const secretsManagerMock = mockClient(SecretsManagerClient);

  afterEach(() => {
    secretsManagerMock.reset();
  });

  test('success', async () => {
    // GIVEN
    const certData = 'BEGIN CERTIFICATE';
    const secretContents = {
      SecretString: certData,
    };
    secretsManagerMock.on(GetSecretValueCommand).resolves(secretContents);
    const client = new SecretsManagerClient();

    // WHEN
    const data = await readCertificateData(secretPartialArn, client);

    // THEN
    expect(data).toStrictEqual(certData);
  });

  test('not a certificate', async () => {
    // GIVEN
    const certData = 'NOT A CERTIFICATE';
    const secretContents = {
      SecretString: certData,
    };
    secretsManagerMock.on(GetSecretValueCommand).resolves(secretContents);
    const client = new SecretsManagerClient();

    // WHEN
    const promise = readCertificateData(secretPartialArn, client);

    // THEN
    await expect(promise).rejects.toThrow(/must contain a Certificate in PEM format/);
  });

  test('binary data', async () => {
    // GIVEN
    const certData = Buffer.from('BEGIN CERTIFICATE', 'utf-8');
    const secretContents = {
      SecretBinary: certData,
    };
    secretsManagerMock.on(GetSecretValueCommand).resolves(secretContents);
    const client = new SecretsManagerClient();

    // WHEN
    const promise = readCertificateData(secretPartialArn, client);

    // THEN
    await expect(promise).rejects.toThrow(/must contain a Certificate in PEM format/);
  });
});
