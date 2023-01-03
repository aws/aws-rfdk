/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
import { readCertificateData } from '../read-certificate';

const secretPartialArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

// @ts-ignore
async function successRequestMock(request: { [key: string]: string}, returnValue: any): Promise<{ [key: string]: any }> {
  return returnValue;
}

describe('readCertificateData', () => {
  beforeEach(() => {
    setSDKInstance(AWS);
  });

  afterEach(() => {
    restore('SecretsManager');
  });

  test('success', async () => {
    // GIVEN
    const certData = 'BEGIN CERTIFICATE';
    const secretContents = {
      SecretString: certData,
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const client = new AWS.SecretsManager();

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
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const client = new AWS.SecretsManager();

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
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const client = new AWS.SecretsManager();

    // WHEN
    const promise = readCertificateData(secretPartialArn, client);

    // THEN
    await expect(promise).rejects.toThrow(/must contain a Certificate in PEM format/);
  });
});
