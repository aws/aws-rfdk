/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import { join } from 'path';

import {
  AttributeType,
  BillingMode,
  Table,
} from '@aws-cdk/aws-dynamodb';
import {
  Grant,
  IGrantable,
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import { IKey } from '@aws-cdk/aws-kms';
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { ISecret, Secret } from '@aws-cdk/aws-secretsmanager';
import {
  Annotations,
  Construct,
  CustomResource,
  Duration,
  IConstruct,
  Names,
  RemovalPolicy,
  Tag,
  Token,
} from '@aws-cdk/core';

import {
  LambdaLayer,
  LambdaLayerVersionArnMapping,
} from '../../lambdas/lambda-layer-version-arn-mapping';
import { IX509CertificateEncodePkcs12, IX509CertificateGenerate } from '../../lambdas/nodejs/x509-certificate';

/**
 * The identification for a self-signed CA or Certificate.
 * These fields are industry standard, and can be found in rfc1779 (see: https://tools.ietf.org/html/rfc1779)
 * or the X.520 specification (see: ITU-T Rec.X.520)
 */
export interface DistinguishedName {
  /**
   * Common Name for the identity.
   *  a) For servers -- The fully qualified domain name (aka: fqdn) of the server.
   *  b) For clients, or as a self-signed CA -- Any name you would like to identify the certificate.
   */
  readonly cn: string;

  /**
   * Organization that is creating the identity. For example, your company name.
   * @default: AWS
   */
  readonly o?: string;

  /**
   * Organization Unit that is creating the identity. For example, the name of your group/unit.
   * @default: Thinkbox
   */
  readonly ou?: string;
}

/**
 * Properties for generating an X.509 certificate.
 */
export interface X509CertificatePemProps {
  /**
   * The subject, or identity, for the generated certificate.
   */
  readonly subject: DistinguishedName;

  /**
   * If provided, then this KMS is used to secure the cert, key, and passphrase Secrets created by the construct.
   * [disable-awslint:ref-via-interface]
   * @default: Uses the account's default CMK (the one named aws/secretsmanager). If a AWS KMS CMK with that name
   * doesn't yet exist, then Secrets Manager creates it for you automatically the first time it needs to encrypt a
   * version's SecretString or SecretBinary fields.
   */
  readonly encryptionKey?: IKey;

  /**
   * If provided, then use this certificate to sign the generated certificate forming a chain of trust.
   * @default: None. The generated certificate will be self-signed
   */
  readonly signingCertificate?: X509CertificatePem;

  /**
   * The number of days that the generated certificate will be valid for.
   *
   * @default 1095 days (3 years)
   */
  readonly validFor?: number;
}

/**
 * Interface for fields found on an X509Certificate construct.
 */
export interface IX509CertificatePem extends IConstruct {
  /**
   * The public certificate chain for this X.509 Certificate encoded in
   * {@link https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail|PEM format}. The text of the chain is stored in the
   * 'SecretString' of the given secret. To extract the public certificate simply copy the contents of the
   * SecretString to a file.
   */
  readonly cert: ISecret;

  /**
   * The private key for this X509Certificate encoded in
   * {@link https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail|PEM format}. The text of the key is stored in the
   * 'SecretString' of the given secret. To extract the public certificate simply copy the contents of the
   * SecretString to a file.
   *
   * Note that the private key is encrypted. The passphrase is stored in the the passphrase Secret.
   *
   * If you need to decrypt the private key into an unencrypted form, then you can:
   * 0. Caution. Decrypting a private key adds a security risk by making it easier to obtain your private key.
   * 1. Copy the contents of the Secret to a file called 'encrypted.key'
   * 2. Run: openssl rsa -in encrypted.key -out decrypted.key
   * 3. Enter the passphrase at the prompt
   */
  readonly key: ISecret;

  /**
   * The encryption passphrase for the private key is stored in the 'SecretString' of this Secret.
   */
  readonly passphrase: ISecret;

  /**
   * A Secret that contains the chain of Certificates used to sign this Certificate
   * @default: No certificate chain is used, signifying a self-signed Certificate
   */
  readonly certChain?: ISecret;
}

interface X509CertificateBaseProps {
  readonly lambdaCode: Code;
  readonly lambdaHandler: string;
  readonly encryptionKey?: IKey;
}

abstract class X509CertificateBase extends Construct {
  /**
   * The encryption passphrase for the private key is in the 'SecretString' of this secret.
   */
  public readonly passphrase: ISecret;

  // The DynamoDB Table that is used as a backing store for the CustomResource utilized in this construct.
  protected database: Table;
  // The Lambda that backs the CustomResource.
  protected lambdaFunc: LambdaFunction;

  protected uniqueTag: Tag;

  constructor(scope: Construct, id: string, props: X509CertificateBaseProps) {
    super(scope, id);

    this.database = new Table(this, 'Table', {
      partitionKey: { name: 'PhysicalId', type: AttributeType.STRING },
      sortKey: { name: 'CustomResource', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      serverSideEncryption: true,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.passphrase = new Secret(this, 'Passphrase', {
      description: `Passphrase for the private key of the X509Certificate ${Names.uniqueId(this)}`,
      encryptionKey: props.encryptionKey,
      generateSecretString: {
        excludeCharacters: '"()$\'', // Exclude characters that might interact with command shells.
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 24,
        requireEachIncludedType: true,
      },
    });

    const openSslLayer = LambdaLayerVersionArnMapping.getLambdaLayerVersion(this, 'OpenSslLayer', LambdaLayer.OPEN_SSL_AL2);

    /*
     * We cannot make this a singleton function; doing so would create circular references in the lambda role (to sign
     * a cert we need a cert that this lambda generated).
     */
    this.lambdaFunc = new LambdaFunction(this, 'Generator', {
      description: `Used by a X509Certificate ${Names.uniqueId(this)} to generate certificates.`,
      code: props.lambdaCode,
      environment: {
        DATABASE: this.database.tableName,
        DEBUG: 'false',
      },
      runtime: Runtime.NODEJS_12_X,
      layers: [ openSslLayer ],
      handler: props.lambdaHandler,
      timeout: Duration.seconds(90),
      logRetention: RetentionDays.ONE_WEEK,
    });
    this.database.grantReadWriteData(this.lambdaFunc);
    this.database.grant(this.lambdaFunc, 'dynamodb:DescribeTable');
    props.encryptionKey?.grantEncrypt(this.lambdaFunc);
    this.passphrase.grantRead(this.lambdaFunc);

    const uniqueValue = crypto.createHash('md5').update(Names.uniqueId(this)).digest('hex');
    this.uniqueTag = new Tag(
      `X509SecretGrant-${uniqueValue.slice(0, 8).toUpperCase()}`,
      uniqueValue,
    );
    const tagCondition: { [key: string]: any } = {};
    tagCondition[`secretsmanager:ResourceTag/${this.uniqueTag.key}`] = this.uniqueTag.value;

    this.lambdaFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:TagResource',
        'secretsmanager:PutSecretValue',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: tagCondition,
      },
    }));
  }
}

/**
 * A Construct that uses a Lambda to generate an X.509 certificate and then saves the certificate's components into
 * Secrets. On an update, if any properties of the construct are changed, then a new certificate will be generated.
 * When the Stack is destroyed or the Construct is removed, the Secrets will all be deleted. An X.509 certificate is
 * comprised of the certificate, a certificate chain with the chain of signing certificates (if any), and a private key
 * that is password protected by a randomly generated passphrase.
 *
 * Cost:
 * The cost of four AWS SecretsManager Secrets in the deployed region.
 * The other resources created by this construct have negligible ongoing costs.
 *
 * Resources Deployed
 * ------------------------
 * - DynamoDB Table - Used for tracking resources created by the Custom Resource.
 * - Secrets - 4 in total, for the certificate, it's private key, the passphrase to the key, and the cert chain.
 * - Lambda Function, with role - Used to create/update/delete the Custom Resource
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - Access to the AWS SecretsManager Secrets that are created by this construct should be tightly restricted
 *   to only the principal(s) that require access.
 */
export class X509CertificatePem extends X509CertificateBase implements IX509CertificatePem {
  public readonly cert: ISecret;
  public readonly key: ISecret;
  public readonly certChain?: ISecret;

  constructor(scope: Construct, id: string, props: X509CertificatePemProps) {
    super(scope, id, {
      lambdaCode: Code.fromAsset(join(__dirname, '..', '..', 'lambdas', 'nodejs')),
      lambdaHandler: 'x509-certificate.generate',
      encryptionKey: props.encryptionKey,
    });

    if ((props.validFor ?? 1) < 1 && !Token.isUnresolved(props.validFor)) {
      Annotations.of(this).addError('Certificates must be valid for at least one day.');
    }

    props.signingCertificate?.cert.grantRead(this.lambdaFunc);
    props.signingCertificate?.key.grantRead(this.lambdaFunc);
    props.signingCertificate?.passphrase.grantRead(this.lambdaFunc);
    props.signingCertificate?.certChain?.grantRead(this.lambdaFunc);

    const signingCertificate = props.signingCertificate
      ? {
        Cert: props.signingCertificate.cert.secretArn,
        Key: props.signingCertificate.key.secretArn,
        Passphrase: props.signingCertificate.passphrase.secretArn,
        CertChain: props.signingCertificate.certChain ? props.signingCertificate.certChain.secretArn : '',
      }
      : undefined;
    const properties: IX509CertificateGenerate = {
      DistinguishedName: {
        CN: props.subject.cn,
        O: props.subject.o ?? 'AWS',
        OU: props.subject.ou ?? 'Thinkbox',
      },
      Passphrase: this.passphrase.secretArn,
      Secret: {
        NamePrefix: this.node.path,
        Description: this.node.path,
        EncryptionKey: props.encryptionKey?.keyArn,
        Tags: [
          {
            Key: this.uniqueTag.key,
            Value: this.uniqueTag.value,
          },
        ],
      },
      SigningCertificate: signingCertificate,
      CertificateValidFor: props.validFor?.toString(),
    };
    const resource = new CustomResource(this, 'Default', {
      serviceToken: this.lambdaFunc.functionArn,
      properties,
      resourceType: 'Custom::RFDK_X509Generator',
    });
    if (this.lambdaFunc.role) {
      // There's a race on update where this resource could execute before the role has updated.
      resource.node.addDependency(this.lambdaFunc.role);
    }

    this.cert = Secret.fromSecretAttributes(this, 'Cert', {
      secretArn: Token.asString(resource.getAtt('Cert')),
      encryptionKey: props.encryptionKey,
    });
    this.key = Secret.fromSecretAttributes(this, 'Key', {
      secretArn: Token.asString(resource.getAtt('Key')),
      encryptionKey: props.encryptionKey,
    });
    // We'll only have a chain if we used a ca to sign this cert. We cannot check for certChainResource being an empty
    // string because it is an unresolved token at this point.
    if (signingCertificate) {
      const certChainResource = resource.getAtt('CertChain');
      this.certChain = certChainResource
        ? Secret.fromSecretAttributes(this, 'CertChain', {
          secretArn: Token.asString(certChainResource),
          encryptionKey: props.encryptionKey,
        })
        : undefined;
    }
  }

  /**
   * Grant read permissions for the certificate
   */
  public grantCertRead(grantee: IGrantable): Grant {
    const result = this.cert.grantRead(grantee);
    this.certChain?.grantRead(grantee);
    return result;
  }

  /**
   * Grant read permissions for the certificate, key, and passphrase
   */
  public grantFullRead(grantee: IGrantable): Grant {
    const result = this.cert.grantRead(grantee);
    this.certChain?.grantRead(grantee);
    this.key.grantRead(grantee);
    this.passphrase.grantRead(grantee);
    return result;
  }
}

/**
 * Construct properties for generating a PKCS #12 file from an X.509 certificate.
 */
export interface X509CertificatePkcs12Props {
  /**
   * The source PEM certificiate for the PKCS #12 file.
   */
  readonly sourceCertificate: X509CertificatePem;

  /**
   * If provided, then this KMS is used to secure the cert, key, and passphrase Secrets created by the construct.
   * [disable-awslint:ref-via-interface]
   * @default: None
   */
  readonly encryptionKey?: IKey;
}

/**
 * Properties of an X.509 PKCS #12 file.
 */
export interface IX509CertificatePkcs12 extends IConstruct {
  /**
   * The PKCS #12 data is stored in the 'SecretBinary' of this Secret.
   */
  readonly cert: ISecret;

  /**
   * The encryption passphrase for the cert is stored in the 'SecretString' of this Secret.
   */
  readonly passphrase: ISecret;
}

/**
 * This Construct will generate a PKCS #12 file from an X.509 certificate in PEM format. The PEM certificate must be
 * provided through an instance of the X509CertificatePem Construct. A Lambda Function is used to do the conversion and
 * the result is stored in a Secret. The PKCS #12 file is password protected with a passphrase that is randomly
 * generated and stored in a Secret.
 *
 * Resources Deployed
 * ------------------------
 * - DynamoDB Table - Used for tracking resources created by the CustomResource.
 * - Secrets - 2 in total, The binary of the PKCS #12 certificate and its passphrase.
 * - Lambda Function, with role - Used to create/update/delete the CustomResource.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - Access to the AWS SecretsManager Secrets that are created by this construct should be tightly restricted
 *   to only the principal(s) that require access.
 */
export class X509CertificatePkcs12 extends X509CertificateBase implements IX509CertificatePkcs12 {

  public readonly cert: ISecret;

  constructor(scope: Construct, id: string, props: X509CertificatePkcs12Props) {
    super(scope, id, {
      lambdaCode: Code.fromAsset(join(__dirname, '..', '..', 'lambdas', 'nodejs')),
      lambdaHandler: 'x509-certificate.convert',
      encryptionKey: props.encryptionKey,
    });

    props.sourceCertificate.grantFullRead(this.lambdaFunc);

    const properties: IX509CertificateEncodePkcs12 = {
      Passphrase: this.passphrase.secretArn,
      Secret: {
        NamePrefix: this.node.path,
        Description: this.node.path,
        EncryptionKey: props.encryptionKey?.keyArn,
        Tags: [
          {
            Key: this.uniqueTag.key,
            Value: this.uniqueTag.value,
          },
        ],
      },
      Certificate: {
        Cert: props.sourceCertificate.cert.secretArn,
        CertChain: props.sourceCertificate.certChain ? props.sourceCertificate.certChain.secretArn : '',
        Key: props.sourceCertificate.key.secretArn,
        Passphrase: props.sourceCertificate.passphrase.secretArn,
      },
    };

    const resource = new CustomResource(this, 'Default', {
      serviceToken: this.lambdaFunc.functionArn,
      properties,
      resourceType: 'Custom::RFDK_X509_PKCS12',
    });

    this.cert = Secret.fromSecretAttributes(this, 'Cert', {
      secretArn: Token.asString(resource.getAtt('Cert')),
      encryptionKey: props.encryptionKey,
    });
  }
}
