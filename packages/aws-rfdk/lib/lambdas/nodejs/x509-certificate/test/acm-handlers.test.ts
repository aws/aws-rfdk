/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
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
    AWSMock.setSDKInstance(AWS);
  });

  afterEach(() => {
    process.env = oldEnv;
    sinon.restore();
    AWSMock.restore();
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
      sinon.stub(Certificate, 'decryptKey').returns(new Promise((res, _rej) => res('key')));

      // Mock out the API call in getSecretString
      AWSMock.mock('SecretsManager', 'getSecretValue', sinon.fake.resolves({ SecretString: 'secret' }));
    });

    test('throws when a secret does not have SecretString', async () => {
      // GIVEN
      const getSecretValueFake = sinon.fake.resolves({});
      AWSMock.remock('SecretsManager', 'getSecretValue', getSecretValueFake);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: new MockCompositeStringIndexTable(),
      });

      // WHEN
      let error = undefined;
      try {
        await importer.doCreate(physicalId, doCreateProps);
      } catch(e) {
        error = e;
      }

      // THEN
      expect(error).toBeDefined();
      expect(error.message).toMatch(/Secret .* did not contain a SecretString as expected/);
      expect(getSecretValueFake.calledOnce).toBe(true);
    });

    test('retries importing certificate', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);
      const putItemStub = sinon.stub(resourceTable, 'putItem').resolves(true);

      const importCertificateStub = sinon.stub()
        .onFirstCall().rejects('Rate exceeded')
        .onSecondCall().rejects('Rate exceeded')
        .onThirdCall().resolves({ CertificateArn: certArn });
      AWSMock.mock('ACM', 'importCertificate', importCertificateStub);

      const backoffJitterStub = sinon.stub(BackoffGenerator.prototype, 'backoffJitter').resolves();
      const shouldContinueStub = sinon.stub(BackoffGenerator.prototype, 'shouldContinue').returns(true);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doCreate(physicalId, doCreateProps))

      // THEN
        .resolves.toEqual({ CertificateArn: certArn });
      expect(getItemStub.calledOnce).toBe(true);
      expect(putItemStub.calledOnce).toBe(true);
      expect(importCertificateStub.calledThrice).toBe(true);
      expect(backoffJitterStub.callCount).toEqual(2);
      // An additional check is made before logging "Retrying..."
      expect(shouldContinueStub.callCount).toEqual(4);
    });

    describe('existing', () => {
      test('throws if item ARN is missing', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves({});

        const importer = new TestAcmCertificateImporter({
          acm: new AWS.ACM(),
          dynamoDb: new AWS.DynamoDB(),
          secretsManager: new AWS.SecretsManager(),
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

        const getCertificateFake = sinon.fake.resolves({});
        AWSMock.mock('ACM', 'getCertificate', getCertificateFake);

        const importer = new TestAcmCertificateImporter({
          acm: new AWS.ACM(),
          dynamoDb: new AWS.DynamoDB(),
          secretsManager: new AWS.SecretsManager(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .rejects.toEqual(new Error(`Database entry ${certArn} could not be found in ACM.`));
        expect(getItemStub.calledOnce).toBe(true);
        expect(getCertificateFake.calledOnce).toBe(true);
      });

      test('imports certificate', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves({ ARN: certArn });

        const getCertificateFake = sinon.fake.resolves({ Certificate: 'cert' });
        AWSMock.mock('ACM', 'getCertificate', getCertificateFake);

        const importCertificateFake = sinon.fake.resolves({});
        AWSMock.mock('ACM', 'importCertificate', importCertificateFake);

        const importer = new TestAcmCertificateImporter({
          acm: new AWS.ACM(),
          dynamoDb: new AWS.DynamoDB(),
          secretsManager: new AWS.SecretsManager(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .resolves.toEqual({ CertificateArn: certArn });
        expect(getItemStub.calledOnce).toBe(true);
        expect(getCertificateFake.calledOnce).toBe(true);
        expect(importCertificateFake.calledOnce).toBe(true);
      });
    });

    describe('new', () => {
      test('throws if CertificateArn not populated', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);

        const importCertificateFake = sinon.fake.resolves({});
        AWSMock.mock('ACM', 'importCertificate', importCertificateFake);

        const importer = new TestAcmCertificateImporter({
          acm: new AWS.ACM(),
          dynamoDb: new AWS.DynamoDB(),
          secretsManager: new AWS.SecretsManager(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        let error = undefined;
        try {
          await importer.doCreate(physicalId, doCreateProps);
        } catch (e) {
          error = e;
        }

        // THEN
        expect(error).toBeDefined();
        expect(error.message).toMatch(/CertificateArn was not properly populated after attempt to import .*$/);
        expect(getItemStub.calledOnce).toBe(true);
        expect(importCertificateFake.calledOnce).toBe(true);
      });

      test('imports certificate', async () => {
        // GIVEN
        const resourceTable = new MockCompositeStringIndexTable();
        const getItemStub = sinon.stub(resourceTable, 'getItem').resolves(undefined);
        const putItemStub = sinon.stub(resourceTable, 'putItem').resolves(true);

        const importCertificateFake = sinon.fake.resolves({ CertificateArn: certArn });
        AWSMock.mock('ACM', 'importCertificate', importCertificateFake);

        const importer = new TestAcmCertificateImporter({
          acm: new AWS.ACM(),
          dynamoDb: new AWS.DynamoDB(),
          secretsManager: new AWS.SecretsManager(),
          resourceTableOverride: resourceTable,
        });

        // WHEN
        await expect(importer.doCreate(physicalId, doCreateProps))

        // THEN
          .resolves.toEqual({ CertificateArn: certArn });
        expect(getItemStub.calledOnce).toBe(true);
        expect(putItemStub.calledOnce).toBe(true);
        expect(importCertificateFake.calledOnce).toBe(true);
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

      const describeCertificateFake = sinon.fake.resolves({ Certificate: { InUseBy: ['something'] } });
      AWSMock.mock('ACM', 'describeCertificate', describeCertificateFake);

      // This is hardcoded in the code being tested
      const maxAttempts = 10;
      const backoffJitterStub = sinon.stub(BackoffGenerator.prototype, 'backoffJitter').resolves();
      const shouldContinueStub = sinon.stub(BackoffGenerator.prototype, 'shouldContinue')
        .returns(true)
        .onCall(maxAttempts - 1).returns(false);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(new Error(`Response from describeCertificate did not contain an empty InUseBy list after ${maxAttempts} attempts.`));
      expect(queryStub.calledOnce).toBe(true);
      expect(describeCertificateFake.callCount).toEqual(maxAttempts);
      expect(backoffJitterStub.callCount).toEqual(maxAttempts);
      expect(shouldContinueStub.callCount).toEqual(maxAttempts);
    });

    test('throws when deleting certificate from ACM fails', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({
        key: { ARN: certArn },
      });

      const describeCertificateFake = sinon.fake.resolves({ Certificate: { InUseBy: [] }});
      AWSMock.mock('ACM', 'describeCertificate', describeCertificateFake);

      const error = new Error('error');
      const deleteCertificateFake = sinon.fake.rejects(error);
      AWSMock.mock('ACM', 'deleteCertificate', deleteCertificateFake);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(error);
      expect(queryStub.calledOnce).toBe(true);
      expect(describeCertificateFake.calledOnce).toBe(true);
      expect(deleteCertificateFake.calledOnce).toBe(true);
    });

    test('warns when deleting certificate from ACM fails with AccessDeniedException', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({
        key: { ARN: certArn },
      });

      const describeCertificateFake = sinon.fake.resolves({ Certificate: { InUseBy: [] }});
      AWSMock.mock('ACM', 'describeCertificate', describeCertificateFake);

      const error = new Error('AccessDeniedException');
      const deleteCertificateFake = sinon.fake.rejects(error);
      AWSMock.mock('ACM', 'deleteCertificate', deleteCertificateFake);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .rejects.toEqual(error);
      expect(queryStub.calledOnce).toBe(true);
      expect(describeCertificateFake.calledOnce).toBe(true);
      expect(deleteCertificateFake.calledOnce).toBe(true);
      expect(consoleWarnSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(consoleWarnSpy.mock.calls.map(args => args[0]).join('\n')).toMatch(new RegExp(`Could not delete Certificate ${certArn}. Please ensure it has been deleted.`));
    });

    test('deletes the certificate', async () => {
      // GIVEN
      const resourceTable = new MockCompositeStringIndexTable();
      const queryStub = sinon.stub(resourceTable, 'query').resolves({ key: { ARN: certArn } });
      const deleteItemStub = sinon.stub(resourceTable, 'deleteItem').resolves(true);

      const describeCertificateFake = sinon.fake.resolves({ Certificate: { InUseBy: [] }});
      AWSMock.mock('ACM', 'describeCertificate', describeCertificateFake);

      const deleteCertificateFake = sinon.fake.resolves({});
      AWSMock.mock('ACM', 'deleteCertificate', deleteCertificateFake);

      const importer = new TestAcmCertificateImporter({
        acm: new AWS.ACM(),
        dynamoDb: new AWS.DynamoDB(),
        secretsManager: new AWS.SecretsManager(),
        resourceTableOverride: resourceTable,
      });

      // WHEN
      await expect(importer.doDelete(physicalId))

      // THEN
        .resolves.not.toThrow();
      expect(queryStub.calledOnce).toBe(true);
      expect(describeCertificateFake.calledOnce).toBe(true);
      expect(deleteCertificateFake.calledOnce).toBe(true);
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
    acm: AWS.ACM,
    dynamoDb: AWS.DynamoDB,
    secretsManager: AWS.SecretsManager,
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
    super(new AWS.DynamoDB(), '', '', '');
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
