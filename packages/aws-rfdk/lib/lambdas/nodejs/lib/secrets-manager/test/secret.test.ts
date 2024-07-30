/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { randomBytes } from 'crypto';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  PutSecretValueCommand,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { sanitizeSecretName, Secret } from '../secret';

// Enable/disable debugging statements.
const DEBUG: boolean = false;
if (!DEBUG) {
  console.debug = () => { };
}

describe('Secret class', () => {
  const secretsManagerMock = mockClient(SecretsManagerClient);

  afterEach(() => {
    secretsManagerMock.reset();
  });

  describe('create', () => {
    test('success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(CreateSecretCommand).resolves({ ARN: arn });
      const name = 'SecretName';
      const client = new SecretsManagerClient();

      const secret = await Secret.create({ name, client });

      expect(secret).toEqual(Secret.fromArn(arn, client));
    });

    test('success - all options + string', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(CreateSecretCommand).resolves({ ARN: arn });
      const name = 'SecretName';
      const client = new SecretsManagerClient();

      const secret = await Secret.create({
        name,
        client,
        encryptionKey: { arn: 'testArn' },
        description: 'test desc',
        data: 'test data',
        tags: [{ Key: 'key', Value: 'value' }],
      });

      expect(secret).toEqual(Secret.fromArn(arn, client));
    });

    test('success - all options + binary', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(CreateSecretCommand).resolves({ ARN: arn });
      const name = 'SecretName';
      const client = new SecretsManagerClient();

      const secret = await Secret.create({
        name,
        client,
        encryptionKey: { arn: 'testArn' },
        description: 'test desc',
        data: Buffer.from(randomBytes(512)),
        tags: [{ Key: 'key', Value: 'value' }],
      });

      expect(secret).toEqual(Secret.fromArn(arn, client));
    });

    test('missing response', async () => {
      secretsManagerMock.on(CreateSecretCommand).resolves({});
      const name = 'SecretName';
      const client = new SecretsManagerClient();

      const secret = await Secret.create({ name, client });

      expect(secret).toBeUndefined();
    });

    test('SecretsManager error', async () => {
      secretsManagerMock.on(CreateSecretCommand).rejects({});
      const name = 'SecretName';
      const client = new SecretsManagerClient();

      await expect(Secret.create({ name, client })).rejects.toThrow();
    });
  });

  describe('delete', () => {
    test('success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(DeleteSecretCommand).resolves({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      expect(secretsManagerMock).toHaveReceivedCommandTimes(DeleteSecretCommand, 1);
    });

    test('secret already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(DeleteSecretCommand).resolves({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      await expect(() => secret.delete()).rejects.toThrow('Secret has already been deleted');
      expect(secretsManagerMock).toHaveReceivedCommandTimes(DeleteSecretCommand, 1);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(DeleteSecretCommand).rejects({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.delete()).rejects.toThrow();
    });
  });

  describe('putValue', () => {
    test('string success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(PutSecretValueCommand).resolves({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      const value = 'Super secret value'.toString();
      await secret.putValue(value);
      expect(secretsManagerMock).toHaveReceivedCommandTimes(PutSecretValueCommand, 1);
      expect(secretsManagerMock).toHaveReceivedCommandWith(PutSecretValueCommand, {
        SecretId: arn,
        SecretBinary: undefined,
        SecretString: value,
      });
    });

    test('Buffer success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(PutSecretValueCommand).resolves({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      const value = Buffer.from(randomBytes(512));
      await secret.putValue(value);
      expect(secretsManagerMock).toHaveReceivedCommandTimes(PutSecretValueCommand, 1);
      expect(secretsManagerMock).toHaveReceivedCommandWith(PutSecretValueCommand, {
        SecretId: arn,
        SecretBinary: value,
        SecretString: undefined,
      });
    });

    test('already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(DeleteSecretCommand).resolves({});
      secretsManagerMock.on(PutSecretValueCommand).resolves({});

      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      const value = 'value';
      await secret.delete();
      await expect(() => secret.putValue(value)).rejects.toThrow('Secret has been deleted');

      expect(secretsManagerMock).not.toHaveReceivedCommand(PutSecretValueCommand);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(PutSecretValueCommand).rejects({});

      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      const value = 'Super secret value';
      await expect(() => secret.putValue(value)).rejects.toThrow();
      expect(secretsManagerMock).toHaveReceivedCommandTimes(PutSecretValueCommand, 1);
    });
  });

  describe('getValue', () => {
    test('SecretString success', async () => {
      const value = 'Super secret value'.toString();

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: value,
      });

      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await secret.getValue();
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    test('SecretBinary Uint8Array success', async () => {
      const value: Uint8Array = new Uint8Array(randomBytes(512));

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretBinary: value,
      });
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await expect(secret.getValue()).resolves.toEqual(Buffer.from(value));
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    test('SecretBinary unknown type error', async () => {
      const value = new ArrayBuffer(0);

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        // We're intentionally passing an unexpected type for this test.
        // @ts-ignore
        SecretBinary: value,
      });
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.getValue()).rejects.toThrow('Unknown type for SecretBinary data');
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    test('already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(DeleteSecretCommand).resolves({});
      secretsManagerMock.on(GetSecretValueCommand).resolves({});

      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      await expect(() => secret.getValue()).rejects.toThrow('Secret has been deleted');
      expect(secretsManagerMock).not.toHaveReceivedCommand(GetSecretValueCommand);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      secretsManagerMock.on(GetSecretValueCommand).rejects({});
      const client = new SecretsManagerClient();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.getValue()).rejects.toThrow();
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });
  });
});

test('fromArn invalid ARN', async () => {
  const invalidArn = 'notAnArn';
  const client = new SecretsManagerClient();
  expect(() => Secret.fromArn(invalidArn, client)).toThrow(`Not a Secret ARN: ${invalidArn}`);
});

test.each([
  ['test', 'test'],
  ['Test', 'Test'],
  ['test_test', 'test_test'],
  ['test+test', 'test+test'],
  ['test.test', 'test.test'],
  ['test@test', 'test@test'],
  ['test-test', 'test-test'],
  ['test-test-', 'test-test-'],
  ['test-----test', 'test-----test'],
  ['t t', 'tt'],
  ['t~t', 'tt'],
  ['t`t', 'tt'],
  ['t     t', 'tt'],
  ['t ~ t', 'tt'],
])('sanitizeSecretName', (name, nameSanitized) => {
  expect(sanitizeSecretName(name)).toEqual(nameSanitized);
});
