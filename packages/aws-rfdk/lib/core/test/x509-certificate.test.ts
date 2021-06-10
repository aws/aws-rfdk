/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  anything,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  InspectionFailure,
} from '@aws-cdk/assert';
import {
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { CfnSecret } from '@aws-cdk/aws-secretsmanager';
import { Stack } from '@aws-cdk/core';

import {
  LambdaLayer,
  LambdaLayerVersionArnMapping,
} from '../../lambdas/lambda-layer-version-arn-mapping';
import {
  X509CertificatePem,
  X509CertificatePkcs12,
} from '../lib/x509-certificate';


test('Generate cert', () => {
  const region = 'us-west-2';
  const stack = new Stack(undefined, 'Stack', { env: { region } });
  const subject = { cn: 'testCN' };

  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
  });
  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);

  // Expect the custom resource for cert generation
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  }));
  // Cannot have a CertificateValidFor property if not given one. Adding one
  // would cause existing certificates to be re-generated on re-deploy, and thus
  // risk breaking customer's setups.
  expectCDK(stack).notTo(haveResourceLike('Custom::RFDK_X509Generator', {
    CertificateValidFor: anything(),
  }));
  // Expect the resource for converting to PKCS #12 not to be created
  expectCDK(stack).notTo(haveResource('Custom::RFDK_X509_PKCS12'));
  // Expect the DynamoDB table used for custom resource tracking
  expectCDK(stack).to(haveResource('AWS::DynamoDB::Table'));
  // Expect a Secret used to store the cert
  expectCDK(stack).to(haveResource('AWS::SecretsManager::Secret'));
  // Expect a policy that can interact with DynamoDB and SecretsManager
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:Scan',
            'dynamodb:ConditionCheckItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ],
        },
        {
          Action: 'dynamodb:DescribeTable',
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: certPassphraseID,
          },
        },
        {
          Action: [
            'secretsmanager:CreateSecret',
            'secretsmanager:DeleteSecret',
            'secretsmanager:TagResource',
            'secretsmanager:PutSecretValue',
          ],
          Condition: {
            StringEquals: {
              'secretsmanager:ResourceTag/X509SecretGrant-F53F5427': 'f53f5427b2e9eb4739661fcc0b249b6e',
            },
          },
        },
      ],
    },
  }));
  // Expect no KMS key for encryption
  expectCDK(stack).notTo(haveResource('AWS::KMS::Key'));
  // Expect Lambda for doing the cert generation to use the generate() handler and openssl layer
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', (props: any, error: InspectionFailure): boolean => {
    if (!props.Handler || props.Handler !== 'x509-certificate.generate') {
      error.failureReason = 'x509-certificate.generate handler not found';
      error.resource = props.Handler;
      return false;
    }
    const openSslLayer = LambdaLayerVersionArnMapping.getSingletonInstance(stack).findInMap(region, LambdaLayer.OPEN_SSL_AL2);
    if (!props.Layers
      || !Array.isArray(props.Layers)
      || Array.of(props.Layers)
        .map(layer => JSON.stringify(layer))
        .filter(l => l.includes(JSON.stringify(stack.resolve(openSslLayer)))).length !== 1) {
      error.failureReason = 'openssl Lambda Layer missing';
      error.resource = props.Layers;
      return false;
    }
    if (!props.Environment
      || !props.Environment.Variables
      || !props.Environment.Variables.DATABASE) {
      error.failureReason = 'DATABASE environment variable not set';
      error.resource = props.Environment?.Variables?.DATABASE;
      return false;
    }
    return true;
  }));

  // Should not be any errors.
  expect(cert.node.metadata.length).toBe(0);
});

test('Generate cert, all options set', () => {
  const stack = new Stack();
  const subject = {
    cn: 'testCN',
    o: 'testO',
    ou: 'testOu',
  };
  const encryptionKey = new Key(stack, 'Key');
  const signingCertificate = new X509CertificatePem(stack, 'SigningCert', { subject });
  const signingCertPassphraseID = stack.getLogicalId(signingCertificate.passphrase.node.defaultChild as CfnSecret);

  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
    encryptionKey,
    signingCertificate,
    validFor: 3000,
  });

  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);

  // Expect the custom resource for cert generation
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'testO',
      OU: 'testOu',
    },
    SigningCertificate: {
      Cert: {
        'Fn::GetAtt': [
          'SigningCert',
          'Cert',
        ],
      },
      Key: {
        'Fn::GetAtt': [
          'SigningCert',
          'Key',
        ],
      },
      Passphrase: {
        Ref: signingCertPassphraseID,
      },
      CertChain: '',
    },
    CertificateValidFor: '3000',
  }));
  // Expect the resource for converting to PKCS #12 not to be created
  expectCDK(stack).notTo(haveResource('Custom::RFDK_X509_PKCS12'));
  // Expect the DynamoDB table used for custom resource tracking
  expectCDK(stack).to(haveResource('AWS::DynamoDB::Table'));
  // Expect a Secret used to store the cert
  expectCDK(stack).to(haveResource('AWS::SecretsManager::Secret'));
  // Expect a KMS key for encryption
  expectCDK(stack).to(haveResource('AWS::KMS::Key'));
  // Expect a policy that can interact with DynamoDB and SecretsManager for the signing cert's custom resource
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:Scan',
            'dynamodb:ConditionCheckItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ],
        },
        {
          Action: 'dynamodb:DescribeTable',
        },
        {
          Action: [
            'kms:Encrypt',
            'kms:ReEncrypt*',
            'kms:GenerateDataKey*',
          ],
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: certPassphraseID,
          },
        },
        {
          Action: [
            'secretsmanager:CreateSecret',
            'secretsmanager:DeleteSecret',
            'secretsmanager:TagResource',
            'secretsmanager:PutSecretValue',
          ],
          Condition: {
            StringEquals: {
              'secretsmanager:ResourceTag/X509SecretGrant-B2B09A60': 'b2b09a6086e87fe14005f4e0b800e4f0',
            },
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            'Fn::GetAtt': [
              'SigningCert',
              'Cert',
            ],
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            'Fn::GetAtt': [
              'SigningCert',
              'Key',
            ],
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: 'SigningCertPassphrase42F0BC4F',
          },
        },
      ],
    },
  }));
  // Expect a policy that can interact with DynamoDB and SecretsManager for the cert's custom resource
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:Scan',
            'dynamodb:ConditionCheckItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ],
        },
        {
          Action: 'dynamodb:DescribeTable',
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: signingCertPassphraseID,
          },
        },
        {
          Action: [
            'secretsmanager:CreateSecret',
            'secretsmanager:DeleteSecret',
            'secretsmanager:TagResource',
            'secretsmanager:PutSecretValue',
          ],
          Condition: {
            StringEquals: {
              'secretsmanager:ResourceTag/X509SecretGrant-BA0FA489': 'ba0fa4898b2088c5b25f15075f605300',
            },
          },
        },
      ],
    },
  }));
  // Expect Lambda for doing the cert generation to use the generate() handler
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', {
    Handler: 'x509-certificate.generate',
  }));
});

test('Grant cert read', () => {
  const stack = new Stack();
  const grantable = new Role(stack, 'TestRole', {
    assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
  });
  const subject = { cn: 'testCN' };

  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
  });
  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);
  cert.grantCertRead(grantable);

  // Expect the custom resource to be created
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  }));
  // Expect the grantCertRead() to add this policy
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        },
      ],
    },
  }));
  // Expect the grantCertRead() not to add this full read policy
  expectCDK(stack).notTo(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Key',
            ],
          },
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        },
      ],
    },
  }));
  // Expect the PKCS #12 generator not to be created
  expectCDK(stack).notTo(haveResource('Custom::RFDK_X509_PKCS12'));
});

test('Grant full read', () => {
  const stack = new Stack();
  const grantable = new Role(stack, 'TestRole', {
    assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
  });
  const subject = { cn: 'testCN' };

  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
  });
  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);
  cert.grantFullRead(grantable);

  // Expect the custom resource to be created
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  }));
  // Expect the grantFullRead() to add this policy
  expectCDK(stack).notTo(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Key',
            ],
          },
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        },
      ],
    },
  }));
  // Expect the PKCS #12 generator not to be created
  expectCDK(stack).notTo(haveResource('Custom::RFDK_X509_PKCS12'));
});

test('Validating expiry', () => {
  // GIVEN
  const stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });
  const subject = { cn: 'testCN' };

  // WHEN
  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
    validFor: 0,
  });

  // THEN
  expect(cert.node.metadata.length).toBe(1);
});

test('Validating expiry with token', () => {
  // GIVEN
  const stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });
  const subject = { cn: 'testCN' };
  // A numeric CDK token (see: https://docs.aws.amazon.com/cdk/latest/guide/tokens.html#tokens_number)
  const CDK_NUMERIC_TOKEN = -1.8881545897087626e+289;

  // WHEN
  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
    validFor: CDK_NUMERIC_TOKEN,
  });

  // THEN
  expect(cert.node.metadata.length).toBe(0);
});

test('Convert to PKCS #12', () => {
  const stack = new Stack();
  const subject = { cn: 'testCN' };
  const cert = new X509CertificatePem(stack, 'Cert', { subject });
  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);

  const pkcs12Cert = new X509CertificatePkcs12(stack, 'CertPkcs12', { sourceCertificate: cert });
  const pkcs12CertPassphraseID = stack.getLogicalId(pkcs12Cert.passphrase.node.defaultChild as CfnSecret);

  // Expect the PKCS #12 custom resource
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509_PKCS12', {
    Passphrase: {
      Ref: 'CertPkcs12Passphrase1E3DF360',
    },
    Secret: {
      NamePrefix: 'Default/CertPkcs12',
      Description: 'Default/CertPkcs12',
      Tags: [
        {
          Key: 'X509SecretGrant-71090F78',
          Value: '71090f7809ce64f7c970cb645d4d473c',
        },
      ],
    },
    Certificate: {
      Cert: {
        'Fn::GetAtt': [
          'Cert',
          'Cert',
        ],
      },
      Key: {
        'Fn::GetAtt': [
          'Cert',
          'Key',
        ],
      },
      Passphrase: {
        Ref: certPassphraseID,
      },
    },
  }));
  // Expect the source certificate (custom resource)
  expectCDK(stack).to(haveResource('Custom::RFDK_X509Generator'));
  // Expect the PKCS #12 to have a password secret
  expectCDK(stack).to(haveResourceLike('AWS::SecretsManager::Secret', {
    Description: 'Passphrase for the private key of the X509Certificate CertPkcs12',
    GenerateSecretString: {
      ExcludeCharacters: '"()$\'',
      ExcludePunctuation: true,
      IncludeSpace: false,
      PasswordLength: 24,
      RequireEachIncludedType: true,
    },
  }));
  // Expect the PKCS #12 resource to have a policy with access to the X.509 resource
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:Scan',
            'dynamodb:ConditionCheckItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ],
        },
        {
          Action: 'dynamodb:DescribeTable',
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: pkcs12CertPassphraseID,
          },
        },
        {
          Action: [
            'secretsmanager:CreateSecret',
            'secretsmanager:DeleteSecret',
            'secretsmanager:TagResource',
            'secretsmanager:PutSecretValue',
          ],
          Condition: {
            StringEquals: {
              'secretsmanager:ResourceTag/X509SecretGrant-71090F78': '71090f7809ce64f7c970cb645d4d473c',
            },
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Key',
            ],
          },
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        },
      ],
    },
  }));
  // Expect no KMS key
  expectCDK(stack).notTo(haveResource('AWS::KMS::Key'));
  // Expect the Lambda for converting the PEM to PKCS 12
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', {
    Handler: 'x509-certificate.convert',
  }));
});

test('Convert to PKCS #12, use KMS', () => {
  const stack = new Stack();
  const subject = { cn: 'testCN' };
  const sourceCertificate = new X509CertificatePem(stack, 'Cert', { subject });
  const certPassphraseID = stack.getLogicalId(sourceCertificate.passphrase.node.defaultChild as CfnSecret);
  const encryptionKey = new Key(stack, 'Key');

  new X509CertificatePkcs12(stack, 'CertPkcs12', {
    sourceCertificate,
    encryptionKey,
  });

  // Expect the PKCS #12 custom resource
  expectCDK(stack).to(haveResourceLike('Custom::RFDK_X509_PKCS12', {
    Passphrase: {
      Ref: 'CertPkcs12Passphrase1E3DF360',
    },
    Secret: {
      NamePrefix: 'Default/CertPkcs12',
      Description: 'Default/CertPkcs12',
      Tags: [
        {
          Key: 'X509SecretGrant-71090F78',
          Value: '71090f7809ce64f7c970cb645d4d473c',
        },
      ],
    },
    Certificate: {
      Cert: {
        'Fn::GetAtt': [
          'Cert',
          'Cert',
        ],
      },
      Key: {
        'Fn::GetAtt': [
          'Cert',
          'Key',
        ],
      },
      Passphrase: {
        Ref: certPassphraseID,
      },
    },
  }));
  // Expect the source certificate (custom resource)
  expectCDK(stack).to(haveResource('Custom::RFDK_X509Generator'));
  // Expect the PKCS #12 to have a password secret
  expectCDK(stack).to(haveResourceLike('AWS::SecretsManager::Secret', {
    Description: 'Passphrase for the private key of the X509Certificate CertPkcs12',
    GenerateSecretString: {
      ExcludeCharacters: '"()$\'',
      ExcludePunctuation: true,
      IncludeSpace: false,
      PasswordLength: 24,
      RequireEachIncludedType: true,
    },
  }));
  // Expect a KMS key for encryption
  expectCDK(stack).to(haveResource('AWS::KMS::Key'));
  // Expect the Lambda for converting the PEM to PKCS #12
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', {
    Handler: 'x509-certificate.convert',
  }));
});
