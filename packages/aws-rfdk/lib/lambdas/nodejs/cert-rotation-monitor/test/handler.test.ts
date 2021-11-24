/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
import { fake } from 'sinon';

import { CertificateRotationMonitor } from '../handler';

jest.mock('../../lib/x509-certs/certificate');

const uniqueID = 'test_ID';

describe('CertificatRotationMonitor', () => {
  let certificateRotationMonitor: CertificateRotationMonitor;
  let consoleLogMock: jest.SpyInstance<any, any>;

  beforeEach(() => {
    setSDKInstance(AWS);
    AWS.config.region = 'us-west-2';
    certificateRotationMonitor = new CertificateRotationMonitor(uniqueID);
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    restore('SecretsManager');
    restore('CloudWatch');
  });

  test('succesfull handler run', async () => {
    // GIVEN
    const secretResponse = {
      ARN: 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/',
      Name: 'X.509-Certificate-Test',
    };
    // eslint-disable-next-line dot-notation
    certificateRotationMonitor['getSecretsByTag'] = jest.fn(async () => {return [secretResponse]; } );

    const fakeGetSecretValue = fake.resolves({
      SecretBinary: 'Super secret value',
    });
    mock(
      'SecretsManager',
      'getSecretValue',
      fakeGetSecretValue,
    );

    const daysBeforeExpire = 10;
    jest.requireMock('../../lib/x509-certs/certificate').Certificate.getExpDate.mockReturnValue(
      Promise.resolve(new Date((new Date()).getTime() + daysBeforeExpire * (1000 * 60 * 60 * 24))));

    mock('CloudWatch', 'putMetricData', (_params: any, callback: Function) => {
      callback(null);
    });

    // WHEN
    await certificateRotationMonitor.handler();

    // THEN
    expect(consoleLogMock.mock.calls.length).toBe(3);
    expect(consoleLogMock.mock.calls[0][0]).toBe(`Certificate '${secretResponse.ARN}' has been found with name '${secretResponse.Name}'.`);
    expect(consoleLogMock.mock.calls[1][0]).toMatch(`Certificate '${secretResponse.ARN}' has ${daysBeforeExpire} days before expire.`);
    expect(consoleLogMock.mock.calls[2][0]).toMatch('Value was added to CertDaysToExpiry metric.');
  });

  test('get secrets list', async () => {
    // GIVEN
    const secretsResponse = [{ARN: 'arn:test_secret'}, {ARN: 'arn:another_test_secret'}];
    mock('SecretsManager', 'listSecrets', (_params: any, callback: Function) => {
      callback(null, {SecretList: secretsResponse});
    });

    // WHEN
    // eslint-disable-next-line dot-notation
    const result = await certificateRotationMonitor['getSecretsByTag'](new AWS.SecretsManager());

    // THEN
    expect(consoleLogMock.mock.calls.length).toBe(0);
    expect(result).toStrictEqual(secretsResponse);
  });

  test('failure in getSecretsByTag', async () => {
    // GIVEN
    mock('SecretsManager', 'listSecrets', (_params: any) => {
      throw new Error('Test error message');
    });

    // THEN
    // eslint-disable-next-line dot-notation
    await expect(certificateRotationMonitor['getSecretsByTag'](new AWS.SecretsManager())).rejects.toThrowError(`getSecretsByTag '${uniqueID}' failed':` +
    'undefined -- Test error message');
  });

  test('failure in putValueToMetric', async () => {
    // GIVEN
    const err = { code: 'errorcode', message: 'not found' };
    mock('CloudWatch', 'putMetricData', (_params: any, callback: Function) => {
      callback(err, null);
    });

    // WHEN
    // eslint-disable-next-line dot-notation
    certificateRotationMonitor['putValueToMetric'](1);

    // THEN
    expect(consoleLogMock.mock.calls.length).toBe(2);
    expect(consoleLogMock.mock.calls[1][0]).toBe(`Failed to put value to CertDaysToExpiry metric: ${err.message}`);
  });
});
