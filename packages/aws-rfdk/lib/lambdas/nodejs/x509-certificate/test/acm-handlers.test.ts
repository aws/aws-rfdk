/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ACMClient,
  AccessDeniedException,
  DescribeCertificateCommand,
  DeleteCertificateCommand,
  GetCertificateCommand,
  ImportCertificateCommand,
  ResourceNotFoundException,
  ThrottlingException,
} from '@aws-sdk/client-acm';
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as sinon from 'sinon';
import { BackoffGenerator } from '../../lib/backoff-generator';
import { CompositeStringIndexTable } from '../../lib/dynamodb';
import { Certificate } from '../../lib/x509-certs';
import { AcmCertificateImporter } from '../acm-handlers';
import { IAcmImportCertProps } from '../types';

describe('AcmCertificateImporter', () => {
  const physicalId = 'physicalId';
  const certArn = 'certArn';
  const oldEnv = process.env;
  const acmMock = mockClient(ACMClient);
  const secretsManagerMock = mockClient(SecretsManagerClient);
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.spyOn(global.console, 'log').mockImplementation(() => {});
    jest.spyOn(global.console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(global.console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    process.env.DATABASE = 'database';
  });

  afterEach(() => {
    process.env = oldEnv;
    sinon.restore();
    acmMock.reset();
    secretsManagerMock.reset();
  });

  describe('doCreate', () => {
    const doCreateProps: IAcmImportCertProps = {
      Tags: [],
      X509CertificatePem: {
        Cert: 'cert',
        CertChain: 'certChain',
        Key: 'key',
        Passphrase: 'passphrase',
      },
    };

    beforeEach(() => {
      sinon.stub(Certificate, 'decryptKey').returns(Promise.resolve('key'));

      // Mock out the API call in getSecretString
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: 'secret' });
    });

    test('throws when a secret does not have SecretString', async () => {
      // GIVEN
      secretsManagerMock.on(GetSecretValueCommand).resolves({});

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: new MockCompositeStringIndexTable(),
      });

      // WHEN
      await expect(importer.doCreate(physicalId, doCreateProps))

      // THEN
        .rejects.toThrow(/Secret .* did not contain a SecretString as expected/);
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    test('retries importing certificate', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);
      const putItemStub = sinon.stub(resourceTable, 'putItem').resolves(true);

      acmMock.on(ImportCertificateCommand)
        .rejectsOnce(new ThrottlingException({message: 'test error', $metadata: {}}))
        .rejectsOnce(new ThrottlingException({message: 'test error', $metadata: {}}))
        .resolves({ CertificateArn: certArn });

      const backoffStub = sinon.stub(BackoffGenerator.prototype, 'backoff').resolves(true);

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doCreate(physicalId, doCreateProps))

      // THEN
        .resolves.toEqual({ CertificateArn: certArn });
      expect(getItemStub.calledOnce).toBe(true);
      expect(putItemStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(ImportCertificateCommand, 3);
      expect(backoffStub.callCount).toEqual(2);
    });

    test('throws after max import retries', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);

      const attempts = 10;
      const importCertificateBehavior = acmMock.on(ImportCertificateCommand);
      const backoffStub = sinon.stub(BackoffGenerator.prototype, 'backoff');
      for (let i = 0; i < attempts; i++) {
        importCertificateBehavior.rejectsOnce(new ThrottlingException({message: 'test error', $metadata: {}}));
        backoffStub.onCall(i).resolves(i < attempts - 1);
      }

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doCreate(physicalId, doCreateProps))

      // THEN
        .rejects.toThrow(/Failed to import certificate .* after [0-9]+ attempts\./);
      expect(getItemStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(ImportCertificateCommand, attempts);
      expect(backoffStub.callCount).toEqual(attempts);
    });

    describe('existing', () => {
      test('throws if item ARN is missing', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves({});

        const importer = new TestAcmCertificateImporter({
          acm: new ACMClient(),
          dynamoDb: new DynamoDBClient(),
          secretsManager: new SecretsManagerClient(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .rejects.toEqual(new Error("Database Item missing 'ARN' attribute"));
        expect(getItemStub.calledOnce).toBe(true);
      });

      test('throws if certificate not found in ACM', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves({ ARN: certArn });

        acmMock.on(GetCertificateCommand)
          .rejects(new ResourceNotFoundException({message: 'not found', $metadata: {}}));

        const importer = new TestAcmCertificateImporter({
          acm: new ACMClient(),
          dynamoDb: new DynamoDBClient(),
          secretsManager: new SecretsManagerClient(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .rejects.toThrow(new RegExp(`Database entry ${certArn} could not be found in ACM:`));
        expect(getItemStub.calledOnce).toBe(true);
        expect(acmMock).toHaveReceivedCommandTimes(GetCertificateCommand, 1);
      });

      test('imports certificate', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves({ ARN: certArn });

        acmMock.on(GetCertificateCommand).resolves({ Certificate: 'cert' });

        acmMock.on(ImportCertificateCommand).resolves({});

        const importer = new TestAcmCertificateImporter({
          acm: new ACMClient(),
          dynamoDb: new DynamoDBClient(),
          secretsManager: new SecretsManagerClient(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .resolves.toEqual({ CertificateArn: certArn });
        expect(getItemStub.calledOnce).toBe(true);
        expect(acmMock).toHaveReceivedCommandTimes(GetCertificateCommand, 1);
        // Verify that we import the existing certificate to support replacing/updating of it (e.g. to rotate certs)
        expect(acmMock).toHaveReceivedCommandTimes(ImportCertificateCommand, 1);
      });
    });

    describe('new', () => {
      test('throws if CertificateArn not populated', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);

        acmMock.on(ImportCertificateCommand).resolves({});

        const importer = new TestAcmCertificateImporter({
          acm: new ACMClient(),
          dynamoDb: new DynamoDBClient(),
          secretsManager: new SecretsManagerClient(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .rejects.toThrow(/CertificateArn was not properly populated after attempt to import .*$/);
        expect(getItemStub.calledOnce).toBe(true);
        expect(acmMock).toHaveReceivedCommandTimes(ImportCertificateCommand, 1);
      });

      test('imports certificate', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);
        const putItemStub = sinon.stub(resourceTable, 'putItem').resolves(true);

        acmMock.on(ImportCertificateCommand).resolves({ CertificateArn: certArn });

        const importer = new TestAcmCertificateImporter({
          acm: new ACMClient(),
          dynamoDb: new DynamoDBClient(),
          secretsManager: new SecretsManagerClient(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .resolves.toEqual({ CertificateArn: certArn });
        expect(getItemStub.calledOnce).toBe(true);
        expect(putItemStub.calledOnce).toBe(true);
        expect(acmMock).toHaveReceivedCommandTimes(ImportCertificateCommand, 1);
      });
    });
  });

  describe('doDelete', () => {

    test('throws if describeCertificate is in use after max attempts', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({
        key: { ARN: certArn },
      });

      acmMock.on(DescribeCertificateCommand).resolves({ Certificate: { InUseBy: ['something'] } });

      // This is hardcoded in the code being tested
      const maxAttempts = 10;
      const backoffStub = sinon.stub(BackoffGenerator.prototype, 'backoff').resolves();
      const shouldContinueStub = sinon.stub(BackoffGenerator.prototype, 'shouldContinue')
        .returns(true)
        .onCall(maxAttempts - 1).returns(false);

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(new Error(`Response from describeCertificate did not contain an empty InUseBy list after ${maxAttempts} attempts.`));
      expect(queryStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(DescribeCertificateCommand, maxAttempts);
      expect(backoffStub.callCount).toEqual(maxAttempts);
      expect(shouldContinueStub.callCount).toEqual(maxAttempts);
    });

    test('throws when deleting certificate from ACM fails', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({
        key: { ARN: certArn },
      });

      acmMock.on(DescribeCertificateCommand).resolves({ Certificate: { InUseBy: [] }});

      const error = new Error('error');
      acmMock.on(DeleteCertificateCommand).rejects(error);

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(error);
      expect(queryStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(DescribeCertificateCommand, 1);
      expect(acmMock).toHaveReceivedCommandTimes(DeleteCertificateCommand, 1);
    });

    test('warns when deleting certificate from ACM fails with AccessDeniedException', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({
        key: { ARN: certArn },
      });

      acmMock.on(DescribeCertificateCommand).resolves({ Certificate: { InUseBy: [] }});

      const error = new AccessDeniedException({message: 'test access denied', $metadata: {}});
      acmMock.on(DeleteCertificateCommand).rejects(error);

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(error);
      expect(queryStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(DescribeCertificateCommand, 1);
      expect(acmMock).toHaveReceivedCommandTimes(DeleteCertificateCommand, 1);
      expect(consoleWarnSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(consoleWarnSpy.mock.calls.map(args => args[0]).join('\n')).toMatch(new RegExp(`Could not delete Certificate ${certArn}. Please ensure it has been deleted.`));
    });

    test('deletes the certificate', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({ key: { ARN: certArn } });
      const deleteItemStub = sinon.stub(resourceTable, 'deleteItem').resolves(true);

      acmMock.on(DescribeCertificateCommand).resolves({ Certificate: { InUseBy: [] }});

      acmMock.on(DeleteCertificateCommand).resolves({});

      const importer = new TestAcmCertificateImporter({
        acm: new ACMClient(),
        dynamoDb: new DynamoDBClient(),
        secretsManager: new SecretsManagerClient(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .resolves.not.toThrow();
      expect(queryStub.calledOnce).toBe(true);
      expect(acmMock).toHaveReceivedCommandTimes(DescribeCertificateCommand, 1);
      expect(acmMock).toHaveReceivedCommandTimes(DeleteCertificateCommand, 1);
      expect(deleteItemStub.calledOnce).toBe(true);
    });
  });
});

/**
 * Specialization of AcmCertificateImporter that overrides methods inherited from
 * DynamoBackedResource so that no API calls are made.
 *
 * This allows the testing code above to focus on the testing the AcmCertificateImporter
 * class without having to deal with mocking out API calls from its parent class.
 */
class TestAcmCertificateImporter extends AcmCertificateImporter {
  private readonly resourceTableOverride: CompositeStringIndexTable;

  constructor(props: {
    acm: ACMClient,
    dynamoDb: DynamoDBClient,
    secretsManager: SecretsManagerClient,
    resourceTableOverride?: CompositeStringIndexTable
  }) {
    super(props.acm, props.dynamoDb, props.secretsManager);
    this.resourceTableOverride = props.resourceTableOverride ?? new MockCompositeStringIndexTable();
  }

  protected async databasePermissionsCheck(): Promise<void> {
    // Do nothing
    return;
  }

  protected async getResourceTable(): Promise<CompositeStringIndexTable> {
    return this.resourceTableOverride;
  }
}

/**
 * Mock implementation of CompositeStringIndexTable that does not make API calls.
 *
 * This allows the test code above to instantiate a CompositeStringIndexTable object
 * that can be mocked.
 */
class MockCompositeStringIndexTable extends CompositeStringIndexTable {
  constructor() {
    super(new DynamoDBClient(), '', '', '');
  }

  public async deleteTable(): Promise<void> {}

  public async putItem(_props: {
    primaryKeyValue: string,
    sortKeyValue: string,
    attributes?: object,
    allow_overwrite?: boolean,
  }): Promise<boolean> {
    return true;
  }

  public async getItem(_props: {
    primaryKeyValue: string,
    sortKeyValue: string,
  }): Promise<{ [key: string]: any } | undefined> {
    return {};
  }

  public async deleteItem(_props: {
    primaryKeyValue: string,
    sortKeyValue: string,
  }): Promise<boolean> {
    return true;
  }

  public async query(
    _primaryKeyValue: string,
    _pageLimit?: number,
  ): Promise<{ [key: string]: { [key: string]: any }}> {
    return {};
  }
}
