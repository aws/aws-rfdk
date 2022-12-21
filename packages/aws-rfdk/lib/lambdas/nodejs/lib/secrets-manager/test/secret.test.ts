/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { randomBytes } from 'crypto';
import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
import { fake } from 'sinon';

import { sanitizeSecretName, Secret } from '../secret';

// Enable/disable debugging statements.
const DEBUG: boolean = false;
if (!DEBUG) {
  console.debug = () => { };
}

describe('Secret class', () => {
  beforeEach(() => {
    setSDKInstance(AWS);
  });

  afterEach(() => {
    restore('SecretsManager');
  });

  describe('create', () => {
    test('success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      mock(
        'SecretsManager',
        'createSecret',
        fake.resolves({ ARN: arn }),
      );
      const name = 'SecretName';
      const client = new AWS.SecretsManager();

      const secret = await Secret.create({ name, client });

      expect(secret).toEqual(Secret.fromArn(arn, client));
    });

    test('success - all options + string', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      mock(
        'SecretsManager',
        'createSecret',
        fake.resolves({ ARN: arn }),
      );
      const name = 'SecretName';
      const client = new AWS.SecretsManager();

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
      mock(
        'SecretsManager',
        'createSecret',
        fake.resolves({ ARN: arn }),
      );
      const name = 'SecretName';
      const client = new AWS.SecretsManager();

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
      mock(
        'SecretsManager',
        'createSecret',
        fake.resolves({}),
      );
      const name = 'SecretName';
      const client = new AWS.SecretsManager();

      const secret = await Secret.create({ name, client });

      expect(secret).toBeUndefined();
    });

    test('SecretsManager error', async () => {
      mock(
        'SecretsManager',
        'createSecret',
        fake.rejects({}),
      );
      const name = 'SecretName';
      const client = new AWS.SecretsManager();

      await expect(Secret.create({ name, client })).rejects.toThrow();
    });
  });

  describe('delete', () => {
    test('success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeDeleteSecret = fake.resolves({});
      mock(
        'SecretsManager',
        'deleteSecret',
        fakeDeleteSecret,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      expect(fakeDeleteSecret.callCount).toEqual(1);
    });

    test('secret already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeDeleteSecret = fake.resolves({});
      mock(
        'SecretsManager',
        'deleteSecret',
        fakeDeleteSecret,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      await expect(() => secret.delete()).rejects.toThrow('Secret has already been deleted');
      expect(fakeDeleteSecret.callCount).toEqual(1);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeDeleteSecret = fake.rejects({});
      mock(
        'SecretsManager',
        'deleteSecret',
        fakeDeleteSecret,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.delete()).rejects.toThrow();
    });
  });

  describe('putValue', () => {
    test('string success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakePutSecretValue = fake.resolves({});
      mock(
        'SecretsManager',
        'putSecretValue',
        fakePutSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      const value = 'Super secret value'.toString();
      await secret.putValue(value);
      expect(fakePutSecretValue.callCount).toEqual(1);
      expect(fakePutSecretValue.calledWith({
        SecretId: arn,
        SecretBinary: undefined,
        SecretString: value,
      })).toBeTruthy();
    });

    test('Buffer success', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakePutSecretValue = fake.resolves({});
      mock(
        'SecretsManager',
        'putSecretValue',
        fakePutSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      const value = Buffer.from(randomBytes(512));
      await secret.putValue(value);
      expect(fakePutSecretValue.callCount).toEqual(1);
      expect(fakePutSecretValue.calledWith({
        SecretId: arn,
        SecretBinary: value,
        SecretString: undefined,
      })).toBeTruthy();
    });

    test('already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeDeleteSecret = fake.resolves({});
      mock(
        'SecretsManager',
        'deleteSecret',
        fakeDeleteSecret,
      );
      const fakePutSecretValue = fake.resolves({});
      mock(
        'SecretsManager',
        'putSecretValue',
        fakePutSecretValue,
      );

      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      const value = 'value';
      await secret.delete();
      await expect(() => secret.putValue(value)).rejects.toThrow('Secret has been deleted');
      expect(fakePutSecretValue.callCount).toEqual(0);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakePutSecretValue = fake.rejects({});
      mock(
        'SecretsManager',
        'putSecretValue',
        fakePutSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      const value = 'Super secret value';
      await expect(() => secret.putValue(value)).rejects.toThrow();
      expect(fakePutSecretValue.callCount).toEqual(1);
    });
  });

  describe('getValue', () => {
    test('SecretString success', async () => {
      const value = 'Super secret value'.toString();

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.resolves({
        SecretString: value,
      });
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await secret.getValue();
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });

    test('SecrectBinary string success', async () => {
      const value = 'Super secret value'.toString();

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.resolves({
        SecretBinary: value,
      });
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(secret.getValue()).resolves.toEqual(Buffer.from(value));
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });

    test('SecretBinary Buffer success', async () => {
      const value = Buffer.from(randomBytes(512));

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.resolves({
        SecretBinary: value,
      });
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(secret.getValue()).resolves.toEqual(value);
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });

    test('SecretBinary ArrayBuffer success', async () => {
      const value: ArrayBufferView = new Int32Array();

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.resolves({
        SecretBinary: value,
      });
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(secret.getValue()).resolves.toEqual(Buffer.from(value.buffer));
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });

    test('SecretBinary unknown type error', async () => {
      const value = new ArrayBuffer(0);

      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.resolves({
        SecretBinary: value,
      });
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.getValue()).rejects.toThrow('Unknown type for SecretBinary data');
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });

    test('already deleted', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeDeleteSecret = fake.resolves({});
      mock(
        'SecretsManager',
        'deleteSecret',
        fakeDeleteSecret,
      );
      const fakeGetSecretValue = fake.resolves({});
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );

      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await secret.delete();
      await expect(() => secret.getValue()).rejects.toThrow('Secret has been deleted');
      expect(fakeGetSecretValue.callCount).toEqual(0);
    });

    test('SecretManager error', async () => {
      const arn = 'arn:aws:secretsmanager:fake0secret1:123:secret:1a2b/';
      const fakeGetSecretValue = fake.rejects({});
      mock(
        'SecretsManager',
        'getSecretValue',
        fakeGetSecretValue,
      );
      const client = new AWS.SecretsManager();
      const secret = Secret.fromArn(arn, client);

      await expect(() => secret.getValue()).rejects.toThrow();
      expect(fakeGetSecretValue.callCount).toEqual(1);
    });
  });
});

test('fromArn invalid ARN', async () => {
  const invalidArn = 'notAnArn';
  const client = new AWS.SecretsManager();
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
