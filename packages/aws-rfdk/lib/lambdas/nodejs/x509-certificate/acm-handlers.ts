/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as crypto from 'crypto';

/* eslint-disable import/no-extraneous-dependencies */
import {
  ACMClient,
  AccessDeniedException,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  GetCertificateCommand,
  ImportCertificateRequest,
  ImportCertificateCommand,
} from '@aws-sdk/client-acm';
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
/* eslint-enable import/no-extraneous-dependencies */

import { LambdaContext } from '../lib/aws-lambda';
import { BackoffGenerator } from '../lib/backoff-generator';
import { CfnRequestEvent, DynamoBackedCustomResource } from '../lib/custom-resource';
import { CompositeStringIndexTable } from '../lib/dynamodb';
import { Certificate } from '../lib/x509-certs';
import {
  IAcmImportCertProps,
  implementsIAcmImportCertProps,
} from './types';

export class AcmCertificateImporter extends DynamoBackedCustomResource {
  protected readonly acmClient: ACMClient;
  protected readonly secretsManagerClient: SecretsManagerClient;

  constructor(
    acmClient: ACMClient,
    dynamoDbClient: DynamoDBClient,
    secretsManagerClient: SecretsManagerClient,
  ) {
    super(dynamoDbClient);

    this.acmClient = acmClient;
    this.secretsManagerClient = secretsManagerClient;
  }

  /* istanbul ignore next */
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
        base: 1000,
        jitterDivisor: 4,
        maxAttempts,
        maxIntervalMs: 30000,
      });

      do {
        const { Certificate: cert } = await this.acmClient.send(new DescribeCertificateCommand({
          CertificateArn: arn,
        }));

        inUseByResources = cert!.InUseBy || [];

        if (inUseByResources.length) {
          console.log(`Sleeping -- Resource ${arn} in use by ${inUseByResources.join(', ')}`);
          await backoffGenerator.backoff();
        } else {
          break;
        }
      } while (backoffGenerator.shouldContinue());

      if (inUseByResources.length) {
        throw new Error(`Response from describeCertificate did not contain an empty InUseBy list after ${maxAttempts} attempts.`);
      }
      console.log(`Deleting resource for '${key}'`);
      try {
        await this.acmClient.send(new DeleteCertificateCommand({ CertificateArn: arn }));
      } catch (e) {
        // AccessDeniedException can happen if either:
        //  a) We do not have the required permission to delete the Certificate (unlikely)
        //  b) The Certificate has already been deleted (more likely)
        if (e instanceof AccessDeniedException) {
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

    const certificate = Buffer.from(args.cert);
    const certificateChain = args.certChain ? Buffer.from(args.certChain) : undefined;
    const privateKey = Buffer.from(args.key);

    const sortKey = crypto.createHash('md5').update(args.cert).digest('hex');
    const existingItem = await args.resourceTable.getItem({
      primaryKeyValue: args.physicalId,
      sortKeyValue: sortKey,
    });

    if (existingItem) {
      if (!existingItem.ARN) {
        throw Error("Database Item missing 'ARN' attribute");
      }

      // Verify that the cert is in ACM
      certificateArn = existingItem.ARN as string;
      try {
        await this.acmClient.send(new GetCertificateCommand({ CertificateArn: certificateArn }));
      } catch(e) {
        throw Error(`Database entry ${existingItem.ARN} could not be found in ACM: ${JSON.stringify(e)}`);
      }

      // Update the cert by performing an import again, with the new values.
      const importCertRequest: ImportCertificateRequest = {
        CertificateArn: certificateArn,
        Certificate: certificate,
        CertificateChain: certificateChain,
        PrivateKey: privateKey,
        Tags: args.tags,
      };
      await this.importCertificate(importCertRequest);
    } else {
      const importCertRequest: ImportCertificateRequest = {
        Certificate: certificate,
        CertificateChain: certificateChain,
        PrivateKey: privateKey,
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

  private async importCertificate(importCertRequest: ImportCertificateRequest) {
    // ACM cert imports are limited to 1 per second (see https://docs.aws.amazon.com/acm/latest/userguide/acm-limits.html#api-rate-limits)
    // We need to backoff & retry in the event that two imports happen in the same second
    const maxAttempts = 10;
    const backoffGenerator = new BackoffGenerator({
      base: 200,
      jitterDivisor: 4,
      maxAttempts,
    });

    let retry = false;
    do {
      try {
        return await this.acmClient.send(new ImportCertificateCommand(importCertRequest));
      } catch (e) {
        console.warn(`Could not import certificate: ${e}`);
        retry = await backoffGenerator.backoff();
        if (retry) {
          console.log('Retrying...');
        }
      }
    } while (retry);

    throw new Error(`Failed to import certificate ${importCertRequest.CertificateArn ?? ''} after ${maxAttempts} attempts.`);
  }

  private async getSecretString(SecretId: string): Promise<string> {
    console.debug(`Retrieving secret: ${SecretId}`);
    const resp = await this.secretsManagerClient.send(new GetSecretValueCommand({ SecretId }));
    if (!resp.SecretString) {
      throw new Error(`Secret ${SecretId} did not contain a SecretString as expected`);
    }
    return resp.SecretString;
  }
}

/**
 * The handler used to import an X.509 certificate to ACM from a Secret
 */
/* istanbul ignore next */
export async function importCert(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new AcmCertificateImporter(
    new ACMClient(),
    new DynamoDBClient(),
    new SecretsManagerClient(),
  );
  return await handler.handler(event, context);
}
