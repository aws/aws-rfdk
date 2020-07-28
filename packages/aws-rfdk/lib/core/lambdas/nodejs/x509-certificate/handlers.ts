/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { randomBytes } from 'crypto';
// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDB, SecretsManager } from 'aws-sdk';

import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, DynamoBackedCustomResource } from '../lib/custom-resource';
import { CompositeStringIndexTable } from '../lib/dynamodb';
import { Key } from '../lib/kms';
import {
  sanitizeSecretName,
  Secret,
} from '../lib/secrets-manager';
import {
  Certificate,
  DistinguishedName,
} from '../lib/x509-certs';

import {
  implementsIX509CertificateEncodePkcs12,
  implementsIX509CertificateGenerate,
  IX509CertificateEncodePkcs12,
  IX509CertificateGenerate,
  IX509ResourceProperties,
} from './types';

const DYNAMODB_VERSION = '2012-08-10';
const SECRETS_MANAGER_VERSION = '2017-10-17';

abstract class X509Common extends DynamoBackedCustomResource {
  protected readonly secretsManagerClient: SecretsManager;

  constructor(
    dynamoDbClient: DynamoDB,
    secretsManagerClient: SecretsManager,
  ) {
    super(dynamoDbClient);

    this.secretsManagerClient = secretsManagerClient;
  }

  public async doDelete(physicalId: string, resourceProperties: IX509ResourceProperties): Promise<void> {
    const resourceTable = await this.getResourceTable();
    await Promise.all([
      this.databasePermissionsCheck(resourceTable),
      this.secretsPermissionsCheck(resourceProperties.Secret.Tags),
    ]);
    const resources = await resourceTable.query(physicalId);
    for (const [key, resource] of Object.entries(resources)) {
      console.log(`Deleting resource for '${key}'`);
      const arn: string = resource.ARN;
      try {
        const secret: Secret = Secret.fromArn(arn, this.secretsManagerClient);
        await secret.delete();
      } catch (e) {
        // AccessDeniedException can happen if either:
        //  a) We legit do not have the required permission to delete the secret (very unlikely)
        //  b) The Secret has already been deleted (much more likely; so we continue)
        if (e.message.indexOf('AccessDeniedException')) {
          console.warn(`Could not delete Secret ${arn}. Please ensure it has been deleted.`);
        }
        throw e; // Rethrow so the custom resource handler will error-out.
      }
      await resourceTable.deleteItem({
        primaryKeyValue: physicalId,
        sortKeyValue: key,
      });
    }
  }

  protected async secretsPermissionsCheck(tags?: Array<{ Key: string, Value: string }>): Promise<void> {
    if (!this.debugMode) { return; }
    const secretName: string = randomBytes(16).toString('hex');
    const secret: Secret | undefined = await Secret.create({
      name: secretName,
      client: this.secretsManagerClient,
      description: 'Permissions check',
      data: 'Test data',
      tags,
    });
    if (!secret) {
      throw new Error('Failed to create secret during permission test.');
    }
    await secret.putValue('Test data 2');
    // await secret.getValue(); // We don't give this permissions to the Lambda
    await secret.delete(true);
  }

  /**
   * Helper for creating a Secret and storing its ARN in the database.
   * CustomResources must be idempotent, and it is theoretically possible that Cfn
   * may invoke our lambda more than once for the same operation. If this happens,
   * then we may already have a Secret ARN stored in the database; if we do,
   * then we must reuse that ARN to avoid resource leakage.
   *
   * It's theoretically possible that this function may race with another invocation
   * of itself, but that is so unlikely. Handling it would complicate this function
   * substantially, so we do not implement for that case.
   * @param args
   */
  protected async createAndStoreSecret(args: {
    readonly database: CompositeStringIndexTable,
    readonly name: string;
    readonly physicalId: string;
    readonly purpose: string;
    readonly data: string | Buffer;
    readonly description: string;
    readonly tags: Array<{ Key: string, Value: string }>;
    readonly encryptionKey?: Key
  }): Promise<string> {
    let secretArn: string;
    const existingItem = await args.database.getItem({
      primaryKeyValue: args.physicalId,
      sortKeyValue: args.purpose,
    });
    if (existingItem) {
      if (!existingItem.ARN) {
        throw Error("Database Item missing 'ARN' attribute");
      }
      secretArn = existingItem.ARN as string;
      const secret = Secret.fromArn(secretArn, this.secretsManagerClient);
      await secret.putValue(args.data);
    } else {
      const secret = await Secret.create({
        name: args.name,
        client: this.secretsManagerClient,
        description: args.description,
        data: args.data,
        tags: args.tags,
        encryptionKey: args.encryptionKey,
      });
      if (!secret || !secret.arn) {
        throw Error('Could not create Secret');
      }
      secretArn = secret.arn;
      await args.database.putItem({
        primaryKeyValue: args.physicalId,
        sortKeyValue: args.purpose,
        attributes: {
          ARN: secretArn,
        },
        allow_overwrite: false,
      });
    }
    return secretArn;
  }
}

export class X509CertificateGenerator extends X509Common {
  constructor(
    dynamoDbClient: DynamoDB,
    secretsManagerClient: SecretsManager,
  ) {
    super(dynamoDbClient, secretsManagerClient);
  }

  public validateInput(data: object): boolean {
    return implementsIX509CertificateGenerate(data);
  }

  public async doCreate(physicalId: string, resourceProperties: IX509CertificateGenerate): Promise<object> {
    const resourceTable = await this.getResourceTable();
    await Promise.all([
      this.databasePermissionsCheck(resourceTable),
      this.secretsPermissionsCheck(resourceProperties.Secret.Tags),
    ]);

    const subject = new DistinguishedName(resourceProperties.DistinguishedName);
    const passphrase = await Secret.fromArn(resourceProperties.Passphrase, this.secretsManagerClient).getValue() as string;
    let signingCert: Certificate | undefined;
    if (resourceProperties.SigningCertificate) {
      const signCert = resourceProperties.SigningCertificate;
      const cert = await Secret.fromArn(signCert.Cert, this.secretsManagerClient).getValue() as string;
      const key = await Secret.fromArn(signCert.Key, this.secretsManagerClient).getValue() as string;
      const pass = await Secret.fromArn(signCert.Passphrase, this.secretsManagerClient).getValue() as string;
      const certChain = signCert.CertChain.length > 0
        ? await Secret.fromArn(signCert.CertChain, this.secretsManagerClient).getValue() as string
        : '';
      signingCert = new Certificate(cert, key, pass, certChain);
    }
    const newCert = await Certificate.fromGenerated(subject, passphrase, signingCert);

    const now = new Date(Date.now());
    // timeSuffix = "<year>-<month>-<day>-<time since epoch>" -- to disambiguate secrets
    // in case we do an update on the same day as a create (both old & new exist at the same time)
    const timeSuffix: string = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getTime()}`;
    const kmsKey = resourceProperties.Secret.EncryptionKey ? Key.fromArn(resourceProperties.Secret.EncryptionKey) : undefined;

    const returnArns: { [key: string]: string } = {};
    const certComponents: Array<{ key: string, purpose: string, data: string | Buffer | undefined}> = [
      {
        key: 'Cert',
        purpose: 'Certificate',
        data: newCert.cert,
      },
      {
        key: 'Key',
        purpose: 'Private Key',
        data: newCert.key,
      },
      {
        key: 'CertChain',
        purpose: 'Certificate Chain',
        data: newCert.certChain,
      },
    ];
    for (const component of certComponents) {
      if (component.data) {
        const data = component.data;
        const purpose = component.purpose;
        const name = sanitizeSecretName(`${resourceProperties.Secret.NamePrefix}-X.509-${purpose}-${timeSuffix}`);

        const arn = await this.createAndStoreSecret({
          database: resourceTable,
          name,
          physicalId,
          purpose,
          data,
          description: `X.509 ${component.purpose} for ${resourceProperties.Secret.Description}`,
          tags: resourceProperties.Secret.Tags,
          encryptionKey: kmsKey,
        });
        returnArns[component.key] = arn;
      } else {
        // Case for CertChain being empty. We cannot just skip it due to constraints put on us by CDK's CustomResource
        returnArns[component.key] = '';
      }
    }

    return returnArns;
  }
}

export class X509CertificateConverter extends X509Common {
  constructor(
    dynamoDbClient: DynamoDB,
    secretsManagerClient: SecretsManager,
  ) {
    super(dynamoDbClient, secretsManagerClient);
  }

  public validateInput(data: object): boolean {
    return implementsIX509CertificateEncodePkcs12(data);
  }

  public async doCreate(physicalId: string, resourceProperties: IX509CertificateEncodePkcs12): Promise<object> {
    const resourceTable = await this.getResourceTable();
    await Promise.all([
      this.databasePermissionsCheck(resourceTable),
      this.secretsPermissionsCheck(resourceProperties.Secret.Tags),
    ]);

    const cert = await Secret.fromArn(resourceProperties.Certificate.Cert, this.secretsManagerClient).getValue() as string;
    const certChain = resourceProperties.Certificate.CertChain.length > 0
      ? await Secret.fromArn(resourceProperties.Certificate.CertChain, this.secretsManagerClient).getValue() as string
      : '';
    const key = await Secret.fromArn(resourceProperties.Certificate.Key, this.secretsManagerClient).getValue() as string;
    const sourcePassphrase = await Secret.fromArn(resourceProperties.Certificate.Passphrase, this.secretsManagerClient).getValue() as string;
    const sourceCert = new Certificate(cert, key, sourcePassphrase, certChain);

    const passphrase = await Secret.fromArn(resourceProperties.Passphrase, this.secretsManagerClient).getValue() as string;
    const newPkcs12 = await sourceCert.toPkcs12(passphrase);

    const now = new Date(Date.now());
    // timeSuffix = "<year>-<month>-<day>-<time since epoch>" -- to disambiguate secrets
    // in case we do an update on the same day as a create (both old & new exist at the same time)
    const timeSuffix: string = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getTime()}`;
    const secretProps = resourceProperties.Secret;
    const kmsKey: Key | undefined = secretProps.EncryptionKey
      ? Key.fromArn(secretProps.EncryptionKey)
      : undefined;

    const returnArns: { [key: string]: string } = {};
    const pkcs12Props = {
      data: newPkcs12,
      database: resourceTable,
      description: `X.509 PKCS #12 Certificate for ${secretProps.Description}`,
      encryptionKey: kmsKey,
      name: sanitizeSecretName(`${secretProps.NamePrefix}-X.509-CertificatePKCS12-${timeSuffix}`),
      physicalId,
      purpose: 'CertificatePKCS12',
      tags: secretProps.Tags,
    };
    returnArns.Cert  = await this.createAndStoreSecret(pkcs12Props);

    return returnArns;
  }
}

/**
 * The handler used to generate an X.509 certificate and then store it in SecretsManager
 */
export async function generate(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new X509CertificateGenerator(
    new DynamoDB({ apiVersion: DYNAMODB_VERSION }),
    new SecretsManager({ apiVersion: SECRETS_MANAGER_VERSION }),
  );
  return await handler.handler(event, context);
}

/**
 * The handler used to convert an X.509 certificate to PKCS #12 and store that in SecretsManager
 */
export async function convert(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new X509CertificateConverter(
    new DynamoDB({ apiVersion: DYNAMODB_VERSION }),
    new SecretsManager({ apiVersion: SECRETS_MANAGER_VERSION }),
  );
  return await handler.handler(event, context);
}