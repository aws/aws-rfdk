/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import { join } from 'path';

import { ICertificate } from '@aws-cdk/aws-certificatemanager';
import {
  AttributeType,
  BillingMode,
  Table,
} from '@aws-cdk/aws-dynamodb';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { IKey } from '@aws-cdk/aws-kms';
import {
  Code,
  LayerVersion,
  Runtime,
  SingletonFunction,
} from '@aws-cdk/aws-lambda';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
  Tag,
  Token,
} from '@aws-cdk/core';

import { ARNS } from '../lambdas/lambdaLayerVersionArns';
import { IAcmImportCertProps } from '../lambdas/nodejs/x509-certificate';

/**
 * Properties for importing a Certificate from Secrets into ACM.
 */
export interface ImportedAcmCertificateProps {
  /**
   * A Secret that contains the Certificate data
   */
  readonly cert: ISecret;

  /**
   * A Secret that contains the encrypted Private Key data
   */
  readonly key: ISecret;

  /**
   * A Secret that contains the passphrase of the encrypted Private Key
   */
  readonly passphrase: ISecret;

  /**
   * A Secret that contains the chain of Certificates used to sign this Certificate
   * @default: No certificate chain is used, signifying a self-signed Certificate
   */
  readonly certChain?: ISecret;

  /**
   * The KMS Key used to encrypt the secrets. The Custom Resource to import the Certificate to ACM will be granted
   * permission to decrypt Secrets using this Key.
   * @default: If the account's default CMK was used to encrypt the Secrets, no special permissions need to be given
   */
  readonly encryptionKey?: IKey;
}

/**
 * A Construct that holds a Custom Resource modelling a certificate that was imported into ACM. It uses a Lambda
 * Function to extract the certificate from Secrets and then import it into ACM. It is intended to be used with the
 * X509CertificatePem Construct.
 *
 * Resources Deployed
 * ------------------------
 * 1) DynamoDB Table - Used for tracking resources created by the CustomResource.
 * 2) Lambda Function, with Role - Used to create/update/delete the CustomResource.
 * 3) ACM Certificate - Created by the CustomResource.
 *
 * @ResourcesDeployed
 */
export class ImportedAcmCertificate extends Construct implements ICertificate {
  private static IMPORTER_UUID = '2d20d8f2-7b84-444e-b738-c75b499a9eaa';

  /**
   * The ARN for the Certificate that was imported into ACM
   */
  public readonly certificateArn: string;
  public readonly stack: Stack;
  // The DynamoDB Table that is used as a backing store for the CustomResource utilized in this construct.
  protected readonly database: Table;
  protected readonly uniqueTag: Tag;

  constructor(scope: Construct, id: string, props: ImportedAcmCertificateProps) {
    super(scope, id);

    this.stack = Stack.of(this);

    this.database = new Table(this, 'Table', {
      partitionKey: { name: 'PhysicalId', type: AttributeType.STRING },
      sortKey: { name: 'CustomResource', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      serverSideEncryption: true,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const region = Stack.of(this).region;
    const openSslLayerName = 'openssl-al2';
    const openSslLayerArns: any = ARNS[openSslLayerName];
    const openSslLayerArn = openSslLayerArns[region];
    const openSslLayer = LayerVersion.fromLayerVersionArn(this, 'OpenSslLayer', openSslLayerArn);

    const lambda = new SingletonFunction(this, 'AcmImporter', {
      uuid: ImportedAcmCertificate.IMPORTER_UUID,
      code: Code.fromAsset(join(__dirname, '..', 'lambdas', 'nodejs')),
      handler: 'x509-certificate.importCert',
      environment: {
        DATABASE: this.database.tableName,
        DEBUG: 'false',
      },
      layers: [ openSslLayer ],
      retryAttempts: 0,
      runtime: Runtime.NODEJS_12_X,
      timeout: Duration.seconds(30),
    });

    this.database.grantReadWriteData(lambda);
    this.database.grant(lambda, 'dynamodb:DescribeTable');
    props.cert.grantRead(lambda);
    props.key.grantRead(lambda);
    props.passphrase.grantRead(lambda);
    props.certChain?.grantRead(lambda);
    props.encryptionKey?.grantDecrypt(lambda);

    const uniqueValue = crypto.createHash('md5').update(this.node.uniqueId).digest('hex');
    this.uniqueTag = new Tag(
      `AcmCertImport-${uniqueValue.slice(0, 8).toUpperCase()}`,
      uniqueValue,
    );
    const tagCondition: { [key: string]: any } = {};
    tagCondition[`aws:RequestTag/${this.uniqueTag.key}`] = this.uniqueTag.value;

    lambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'acm:AddTagsToCertificate',
        'acm:ImportCertificate',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: tagCondition,
      },
    }));

    // GetCertificate and DeleteCertificate don't currently support and conditions, so we have to give a broader policy
    // on them for now.
    // See https://docs.aws.amazon.com/IAM/latest/UserGuide/list_awscertificatemanager.html#awscertificatemanager-aws_TagKeys
    // for the condition keys currently available on ACM actions.
    lambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'acm:DeleteCertificate',
        'acm:GetCertificate',
      ],
      resources: ['*'],
    }));

    const properties: IAcmImportCertProps = {
      X509CertificatePem: {
        Cert: props.cert.secretArn,
        Key: props.key.secretArn,
        Passphrase: props.passphrase.secretArn,
        CertChain: props.certChain ? props.certChain.secretArn : '',
      },
      Tags: [
        {
          Key: this.uniqueTag.key,
          Value: this.uniqueTag.value,
        },
        { Key: 'Name',
          Value: this.uniqueTag.value,
        },
      ],
    };

    const resource = new CustomResource(this, 'Default', {
      serviceToken: lambda.functionArn,
      properties,
      resourceType: 'Custom::RFDK_AcmImportedCertificate',
    });

    this.certificateArn = Token.asString(resource.getAtt('CertificateArn'));
  }
}