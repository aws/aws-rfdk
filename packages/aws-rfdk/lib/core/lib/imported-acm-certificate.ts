/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import { join } from 'path';

import {
  Certificate,
  ICertificate,
} from '@aws-cdk/aws-certificatemanager';
import {
  Metric,
  MetricOptions,
} from '@aws-cdk/aws-cloudwatch';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
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
  Names,
  RemovalPolicy,
  ResourceEnvironment,
  Stack,
  Tag,
  Token,
} from '@aws-cdk/core';

import { ARNS } from '../../lambdas/lambdaLayerVersionArns';
import { IAcmImportCertProps } from '../../lambdas/nodejs/x509-certificate';

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
 * A Construct that creates an AWS CloudFormation Custom Resource that models a certificate that is imported into
 * AWS Certificate Manager (ACM). It uses an AWS Lambda Function to extract the certificate from Secrets in AWS SecretsManager
 * and then import it into ACM. The interface is intended to be used with the {@link X509CertificatePem} Construct.
 *
 * ![architecture diagram](/diagrams/core/ImportedAcmCertificate.svg)
 *
 * Resources Deployed
 * ------------------------
 * - DynamoDB Table - Used for tracking resources created by the Custom Resource.
 * - An AWS Lambda Function, with IAM Role - Used to create/update/delete the Custom Resource.
 * - AWS Certificate Manager Certificate - Created by the Custom Resource.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The AWS Lambda for this construct also has broad IAM permissions to delete any Certificate that is stored
 *   in AWS Certificate Manager. You should not grant any additional actors/principals the ability to modify or
 *   execute this Lambda.
 */
export class ImportedAcmCertificate extends Construct implements ICertificate {
  private static IMPORTER_UUID = '2d20d8f2-7b84-444e-b738-c75b499a9eaa';
  private static CERT_LOOKUP_CONSTRUCT_ID = 'CertificateLookup';

  /**
   * The ARN for the Certificate that was imported into ACM
   */
  public readonly certificateArn: string;

  /**
   * @inheritdoc
   */
  public readonly stack: Stack;

  /**
   * @inheritdoc
   */
  public readonly env: ResourceEnvironment;

  /**
   * The DynamoDB Table that is used as a backing store for the CustomResource utilized in this construct.
   */
  protected readonly database: Table;

  protected readonly resource: CustomResource;

  /**
   * A unique tag that is applied to this certificate that can be used to grant permissions to it.
   */
  protected readonly uniqueTag: Tag;

  constructor(scope: Construct, id: string, props: ImportedAcmCertificateProps) {
    super(scope, id);
    this.stack = Stack.of(this);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };

    this.database = new Table(this, 'Table', {
      partitionKey: { name: 'PhysicalId', type: AttributeType.STRING },
      sortKey: { name: 'CustomResource', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: TableEncryption.AWS_MANAGED,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const region = Stack.of(this).region;
    const openSslLayerName = 'openssl-al2';
    const openSslLayerArns: any = ARNS[openSslLayerName];
    const openSslLayerArn = openSslLayerArns[region];
    const openSslLayer = LayerVersion.fromLayerVersionArn(this, 'OpenSslLayer', openSslLayerArn);

    const lambda = new SingletonFunction(this, 'AcmImporter', {
      uuid: ImportedAcmCertificate.IMPORTER_UUID,
      code: Code.fromAsset(join(__dirname, '..', '..', 'lambdas', 'nodejs')),
      handler: 'x509-certificate.importCert',
      environment: {
        DATABASE: this.database.tableName,
        DEBUG: 'false',
      },
      layers: [ openSslLayer ],
      retryAttempts: 0,
      runtime: Runtime.NODEJS_12_X,
      timeout: Duration.minutes(5),
    });

    this.database.grantReadWriteData(lambda);
    this.database.grant(lambda, 'dynamodb:DescribeTable');
    props.cert.grantRead(lambda);
    props.key.grantRead(lambda);
    props.passphrase.grantRead(lambda);
    props.certChain?.grantRead(lambda);
    props.encryptionKey?.grantDecrypt(lambda);

    const uniqueValue = crypto.createHash('md5').update(Names.uniqueId(this)).digest('hex');
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
        'acm:DescribeCertificate',
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

    this.resource = new CustomResource(this, 'Default', {
      serviceToken: lambda.functionArn,
      properties,
      resourceType: 'Custom::RFDK_AcmImportedCertificate',
    });

    this.certificateArn = Token.asString(this.resource.getAtt('CertificateArn'));
  }

  /**
   * Apply a removal policy to the custom resource that represents the certificate imported into ACM
   */
  public applyRemovalPolicy(policy: RemovalPolicy) {
    this.resource.applyRemovalPolicy(policy);
  }
  /**
   * @inheritdoc
   */
  metricDaysToExpiry(props?: MetricOptions): Metric {
    const certLookupNode = this.node.tryFindChild(ImportedAcmCertificate.CERT_LOOKUP_CONSTRUCT_ID);
    let certLookup: ICertificate | undefined;

    /* istanbul ignore next */
    if (certLookupNode) {
      certLookup = certLookupNode as Certificate;
    } else {
      certLookup = Certificate.fromCertificateArn(
        this,
        ImportedAcmCertificate.CERT_LOOKUP_CONSTRUCT_ID,
        this.certificateArn,
      );
    }

    return certLookup.metricDaysToExpiry(props);
  }
}
