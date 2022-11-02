/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Lazy,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnSecret } from 'aws-cdk-lib/aws-secretsmanager';

import {
  X509CertificatePem,
  X509CertificatePkcs12,
} from '../lib/x509-certificate';


test('Generate cert', () => {
  const stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });
  const subject = { cn: 'testCN' };

  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
  });

  // Expect the custom resource for cert generation
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  });
  // Cannot have a CertificateValidFor property if not given one. Adding one
  // would cause existing certificates to be re-generated on re-deploy, and thus
  // risk breaking customer's setups.
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', Match.not({
    CertificateValidFor: Match.anyValue(),
  }));
  // Expect the resource for converting to PKCS #12 not to be created
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509_PKCS12', 0);
  // Expect the DynamoDB table used for custom resource tracking
  Template.fromStack(stack).resourceCountIs('AWS::DynamoDB::Table', 1);
  // Expect a Secret used to store the cert passphrase
  Template.fromStack(stack).resourceCountIs('AWS::SecretsManager::Secret', 1);
  // Expect a policy that can interact with DynamoDB and SecretsManager
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
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
            'dynamodb:DescribeTable',
          ],
        }),
        Match.objectLike({
          Action: 'dynamodb:DescribeTable',
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: Match.stringLikeRegexp('^CertPassphrase.*'),
          },
        }),
        Match.objectLike({
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
        }),
      ]),
    },
  });
  // Expect no KMS key for encryption
  Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 0);
  // Expect Lambda for doing the cert generation to use the generate() handler and openssl layer
  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'x509-certificate.generate',
    Layers: Match.arrayWith([
      Match.stringLikeRegexp('^arn:aws:lambda:us-west-2:224375009292:layer:openssl-al2:.*'),
    ]),
    Environment: {
      Variables: {
        DATABASE: {
          Ref: Match.stringLikeRegexp('^CertTable.*'),
        },
      },
    },
  });
  // Expect Table to have point in time recovery set to true
  Template.fromStack(stack).hasResourceProperties('AWS::DynamoDB::Table', {
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true,
    },
  });

  // Should not be any errors.
  Annotations.fromStack(stack).hasNoInfo(`/${cert.node.path}`, Match.anyValue());
  Annotations.fromStack(stack).hasNoWarning(`/${cert.node.path}`, Match.anyValue());
  Annotations.fromStack(stack).hasNoError(`/${cert.node.path}`, Match.anyValue());
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

  new X509CertificatePem(stack, 'Cert', {
    subject,
    encryptionKey,
    signingCertificate,
    validFor: 3000,
  });

  // Expect the custom resource for cert generation
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
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
        Ref: Match.stringLikeRegexp('^SigningCertPassphrase.*'),
      },
      CertChain: '',
    },
    CertificateValidFor: '3000',
  });
  // Expect the resource for converting to PKCS #12 not to be created
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509_PKCS12', 0);
  // Expect a policy that can interact with DynamoDB and SecretsManager for the signing cert's custom resource
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
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
            'dynamodb:DescribeTable',
          ],
        }),
        Match.objectLike({
          Action: 'dynamodb:DescribeTable',
        }),
        Match.objectLike({
          Action: [
            'kms:Encrypt',
            'kms:ReEncrypt*',
            'kms:GenerateDataKey*',
          ],
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: Match.stringLikeRegexp('^CertPassphrase.*'),
          },
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: 'SigningCertPassphrase42F0BC4F',
          },
        }),
      ]),
    },
  });
  // Expect a policy that can interact with DynamoDB and SecretsManager for the cert's custom resource
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
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
            'dynamodb:DescribeTable',
          ],
        }),
        Match.objectLike({
          Action: 'dynamodb:DescribeTable',
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: Match.stringLikeRegexp('^SigningCertPassphrase.*'),
          },
        }),
        Match.objectLike({
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
        }),
      ]),
    }),
  });
  // Expect Lambda for doing the cert generation to use the generate() handler
  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'x509-certificate.generate',
  });
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
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  });
  // Expect the grantCertRead() to add this policy
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
  });
  // Expect the grantCertRead() not to add this full read policy
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', Match.not({
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        }),
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Key',
            ],
          },
        }),
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        }),
      ]),
    },
  }));
  // Expect the PKCS #12 generator not to be created
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509_PKCS12', 0);
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
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509Generator', {
    DistinguishedName: {
      CN: 'testCN',
      O: 'AWS',
      OU: 'Thinkbox',
    },
  });
  // Expect the grantFullRead() to add this policy
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', Match.not({
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Cert',
            ],
          },
        }),
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [
              'Cert',
              'Key',
            ],
          },
        }),
        Match.objectLike({
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        }),
      ]),
    },
  }));
  // Expect the PKCS #12 generator not to be created
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509_PKCS12', 0);
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
  Annotations.fromStack(stack).hasError(`/${cert.node.path}`, 'Certificates must be valid for at least one day.');
});

test('Validating expiry with token', () => {
  // GIVEN
  const stack = new Stack(undefined, 'Stack', { env: { region: 'us-west-2' } });
  const subject = { cn: 'testCN' };

  // WHEN
  const cert = new X509CertificatePem(stack, 'Cert', {
    subject,
    validFor: Lazy.number({
      produce() {
        return 0;
      },
    }),
  });

  // THEN
  Annotations.fromStack(stack).hasNoInfo(`/${cert.node.path}`, Match.anyValue());
  Annotations.fromStack(stack).hasNoWarning(`/${cert.node.path}`, Match.anyValue());
  Annotations.fromStack(stack).hasNoError(`/${cert.node.path}`, Match.anyValue());
});

test('Convert to PKCS #12', () => {
  const stack = new Stack();
  const subject = { cn: 'testCN' };
  const cert = new X509CertificatePem(stack, 'Cert', { subject });
  const certPassphraseID = stack.getLogicalId(cert.passphrase.node.defaultChild as CfnSecret);

  const pkcs12Cert = new X509CertificatePkcs12(stack, 'CertPkcs12', { sourceCertificate: cert });
  const pkcs12CertPassphraseID = stack.getLogicalId(pkcs12Cert.passphrase.node.defaultChild as CfnSecret);

  // Expect the PKCS #12 custom resource
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509_PKCS12', {
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
  });
  // Expect the source certificate (custom resource)
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509Generator', 1);
  // Expect the PKCS #12 to have a password secret
  Template.fromStack(stack).hasResourceProperties('AWS::SecretsManager::Secret', {
    Description: 'Passphrase for the private key of the X509Certificate CertPkcs12',
    GenerateSecretString: {
      ExcludeCharacters: '"()$\'',
      ExcludePunctuation: true,
      IncludeSpace: false,
      PasswordLength: 24,
      RequireEachIncludedType: true,
    },
  });
  // Expect the PKCS #12 resource to have a policy with access to the X.509 resource
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
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
            'dynamodb:DescribeTable',
          ],
        }),
        Match.objectLike({
          Action: 'dynamodb:DescribeTable',
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Resource: {
            Ref: pkcs12CertPassphraseID,
          },
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
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
        }),
        Match.objectLike({
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            Ref: certPassphraseID,
          },
        }),
      ]),
    }),
  });
  // Expect no KMS key
  Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 0);
  // Expect the Lambda for converting the PEM to PKCS 12
  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'x509-certificate.convert',
  });
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
  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_X509_PKCS12', {
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
  });
  // Expect the source certificate (custom resource)
  Template.fromStack(stack).resourceCountIs('Custom::RFDK_X509Generator', 1);
  // Expect the PKCS #12 to have a password secret
  Template.fromStack(stack).hasResourceProperties('AWS::SecretsManager::Secret', {
    Description: 'Passphrase for the private key of the X509Certificate CertPkcs12',
    GenerateSecretString: {
      ExcludeCharacters: '"()$\'',
      ExcludePunctuation: true,
      IncludeSpace: false,
      PasswordLength: 24,
      RequireEachIncludedType: true,
    },
  });
  // Expect a KMS key for encryption
  Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 1);
  // Expect the Lambda for converting the PEM to PKCS #12
  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'x509-certificate.convert',
  });
});
