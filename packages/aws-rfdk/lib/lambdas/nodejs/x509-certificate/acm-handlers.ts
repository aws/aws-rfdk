/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as crypto from 'crypto';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ACM, DynamoDB, SecretsManager } from 'aws-sdk';

import { LambdaContext } from '../lib/aws-lambda';
import { BackoffGenerator } from '../lib/backoff-generator';
import { CfnRequestEvent, DynamoBackedCustomResource } from '../lib/custom-resource';
import { CompositeStringIndexTable } from '../lib/dynamodb';
import { Certificate } from '../lib/x509-certs';

import {
  IAcmImportCertProps,
  implementsIAcmImportCertProps,
} from './types';

const ACM_VERSION = '2015-12-08';
const DYNAMODB_VERSION = '2012-08-10';
const SECRETS_MANAGER_VERSION = '2017-10-17';

export class AcmCertificateImporter extends DynamoBackedCustomResource {
  protected readonly acmClient: ACM;
  protected readonly secretsManagerClient: SecretsManager;

  constructor(
    acmClient: ACM,
    dynamoDbClient: DynamoDB,
    secretsManagerClient: SecretsManager,
  ) {
    super(dynamoDbClient);

    this.acmClient = acmClient;
    this.secretsManagerClient = secretsManagerClient;
  }

  public validateInput(data: object): boolean {
    return implementsIAcmImportCertProps(data);
  }

  public async doCreate(physicalId: string, resourceProperties: IAcmImportCertProps): Promise<object> {
    const resourceTable = await this.getResourceTable();
    await Promise.all([
      this.databasePermissionsCheck(resourceTable),
    ]);

    const cert = await this.getSecretString(resourceProperties.X509CertificatePem.Cert);
    const certChainArn = resourceProperties.X509CertificatePem.CertChain;
    const certChain = certChainArn.length > 0 ? await this.getSecretString(certChainArn) : undefined;

    const key = await this.getSecretString(resourceProperties.X509CertificatePem.Key);
    const passphrase = await this.getSecretString(resourceProperties.X509CertificatePem.Passphrase);
    const decryptedKey = await Certificate.decryptKey(key, passphrase);

    const tags = resourceProperties.Tags;

    const certificateArn = await this.importAndStoreCertificate({
      resourceTable,
      key: decryptedKey,
      cert,
      certChain,
      physicalId,
      tags,
    });

    return { CertificateArn: certificateArn };
  }

  public async doDelete(physicalId: string): Promise<void> {
    const resourceTable = await this.getResourceTable();
    await Promise.all([
      this.databasePermissionsCheck(resourceTable),
    ]);
    const resources = await resourceTable.query(physicalId);

    const maxAttempts = 10;
    for (const [key, resource] of Object.entries(resources)) {
      const arn: string = resource.ARN;
      let inUseByResources = [];
      const backoffGenerator = new BackoffGenerator({
        base: 200,
        jitterDivisor: 4,
        maxAttempts,
      });

      do {
        const { Certificate: cert } = await this.acmClient.describeCertificate({
          CertificateArn: arn,
        }).promise();

        inUseByResources = cert!.InUseBy || [];

        if (inUseByResources.length) {
          await backoffGenerator.backoffJitter();
        } else {
          break;
        }
      } while (backoffGenerator.shouldContinue());

      if (inUseByResources.length) {
        throw new Error(`Response from describeCertificate did not contain an empty InUseBy list after ${maxAttempts} attempts.`);
      }
      console.log(`Deleting resource for '${key}'`);
      try {
        await this.acmClient.deleteCertificate({ CertificateArn: arn }).promise();
      } catch (e) {
        // AccessDeniedException can happen if either:
        //  a) We do not have the required permission to delete the Certificate (unlikely)
        //  b) The Certificate has already been deleted (more likely)
        if (e.message.indexOf('AccessDeniedException')) {
          console.warn(`Could not delete Certificate ${arn}. Please ensure it has been deleted.`);
        }
        throw e; // Rethrow so the custom resource handler will error-out.
      }
      await resourceTable.deleteItem({
        primaryKeyValue: physicalId,
        sortKeyValue: key,
      });
    }
  }

  protected async importAndStoreCertificate(args: {
    readonly cert: string,
    readonly certChain?: string,
    readonly resourceTable: CompositeStringIndexTable,
    readonly key: string,
    readonly physicalId: string;
    readonly tags: Array<{ Key: string, Value: string }>;
  }): Promise<string> {
    let certificateArn: string;

    const sortKey = crypto.createHash('md5').update(args.cert).digest('hex');
    const existingItem = await args.resourceTable.getItem({
      primaryKeyValue: args.physicalId,
      sortKeyValue: sortKey,
    });
    if (existingItem) {
      if (!existingItem.ARN) {
        throw Error("Database Item missing 'ARN' attribute");
      }
      certificateArn = existingItem.ARN as string;
      const certificate = await this.acmClient.getCertificate({ CertificateArn: certificateArn }).promise();
      // If the cert already existed, we will updating it by performing an import again, with the new values.
      if (certificate.Certificate) {
        const importCertRequest = {
          CertificateArn: certificateArn,
          Certificate: args.cert,
          CertificateChain: args.certChain,
          PrivateKey: args.key,
          Tags: args.tags,
        };
        await this.importCertificate(importCertRequest);
      } else {
        throw Error(`Database entry ${existingItem.ARN} could not be found in ACM.`);
      }
    } else {
      const importCertRequest = {
        Certificate: args.cert,
        CertificateChain: args.certChain,
        PrivateKey: args.key,
        Tags: args.tags,
      };

      const resp = await this.importCertificate(importCertRequest);

      if (!resp.CertificateArn) {
        throw new Error(`CertificateArn was not properly populated after attempt to import ${args.cert}`);
      }
      certificateArn = resp.CertificateArn;

      await args.resourceTable.putItem({
        primaryKeyValue: args.physicalId,
        sortKeyValue: sortKey,
        attributes: {
          ARN: certificateArn,
        },
        allow_overwrite: false,
      });
    }

    return certificateArn;
  }

  private async importCertificate(importCertRequest: ACM.ImportCertificateRequest) {
    // ACM cert imports are limited to 1 per second (see https://docs.aws.amazon.com/acm/latest/userguide/acm-limits.html#api-rate-limits)
    // We need to backoff & retry in the event that two imports happen in the same second
    const maxAttempts = 10;
    const backoffGenerator = new BackoffGenerator({
      base: 200,
      jitterDivisor: 4,
      maxAttempts,
    });

    do {
      try {
        return await this.acmClient.importCertificate(importCertRequest).promise();
      } catch (e) {
        console.warn(`Could not import certificate: ${e}`);
        await backoffGenerator.backoffJitter();
        if (backoffGenerator.shouldContinue()) {
          console.log('Retrying...');
        }
      }
    } while (backoffGenerator.shouldContinue());

    throw new Error(`Failed to import certificate ${importCertRequest.CertificateArn ?? ''} after ${maxAttempts} attempts.`);
  }

  private async getSecretString(SecretId: string): Promise<string> {
    console.debug(`Retrieving secret: ${SecretId}`);
    const resp = await this.secretsManagerClient.getSecretValue({ SecretId }).promise();
    if (!resp.SecretString) {
      throw new Error(`Secret ${SecretId} did not contain a SecretString as expected`);
    }
    return resp.SecretString;
  }
}

/**
 * The handler used to import an X.509 certificate to ACM from a Secret
 */
export async function importCert(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new AcmCertificateImporter(
    new ACM({ apiVersion: ACM_VERSION }),
    new DynamoDB({ apiVersion: DYNAMODB_VERSION }),
    new SecretsManager({ apiVersion: SECRETS_MANAGER_VERSION }),
  );
  return await handler.handler(event, context);
}
