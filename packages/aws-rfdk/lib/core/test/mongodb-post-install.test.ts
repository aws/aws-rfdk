/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as cdkExpect,
  haveResource,
  haveResourceLike,
  ResourcePart,
} from '@aws-cdk/assert';
import {
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  ISecret,
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Stack,
} from '@aws-cdk/core';

import {
  MongoDbUsers,
  MongoDbX509User,
  MongoDbInstance,
  MongoDbPostInstallSetup,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  X509CertificatePem,
} from '../lib';

describe('MongoDbPostInstall', () => {
  let stack: Stack;
  let vpc: Vpc;
  let mongoDb: MongoDbInstance;
  let pwUser1Arn: string;
  let pwUser2Arn: string;
  let pwUser1: ISecret;
  let pwUser2: ISecret;
  let x509User1Arn: string;
  let x509User2Arn: string;
  let x509User1: MongoDbX509User;
  let x509User2: MongoDbX509User;

  beforeEach(() => {
    const hostname = 'mongodb';
    const zoneName = 'testZone.internal';
    const version = MongoDbVersion.COMMUNITY_3_6;
    const userSsplAcceptance = MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL;

    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    const dnsZone = new PrivateHostedZone(stack, 'PrivateHostedZone', {
      vpc,
      zoneName,
    });
    const caCert = new X509CertificatePem(stack, 'CaCert', {
      subject: {
        cn: 'DistinguishedName',
      },
    });
    const serverCert = new X509CertificatePem(stack, 'ServerCert', {
      subject: {
        cn: `${hostname}.${zoneName}`,
      },
      signingCertificate: caCert,
    });
    mongoDb = new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
    });

    pwUser1Arn = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User1-abcdef';
    pwUser2Arn = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User2-abcdef';
    pwUser1 = Secret.fromSecretCompleteArn(stack, 'PwUser1', pwUser1Arn);
    pwUser2 = Secret.fromSecretCompleteArn(stack, 'PwUser2', pwUser2Arn);

    x509User1Arn = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/X509User1-abcdef';
    x509User2Arn = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/X509User2-abcdef';
    x509User1 = {
      certificate: Secret.fromSecretCompleteArn(stack, 'x509User1', x509User1Arn),
      roles: JSON.stringify([ { role: 'readWrite', db: 'testdb1' } ]),
    };
    x509User2 = {
      certificate: Secret.fromSecretCompleteArn(stack, 'x509User2', x509User2Arn),
      roles: JSON.stringify([ { role: 'readWrite', db: 'testdb2' } ]),
    };
  });

  test('created correctly: both user types', () => {
    // GIVEN
    const users: MongoDbUsers = {
      passwordAuthUsers: [ pwUser1, pwUser2 ],
      x509AuthUsers: [ x509User1, x509User2 ],
    };

    // WHEN
    new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
      vpc,
      mongoDb,
      users,
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'mongodb.configureMongo',
      Environment: {
        Variables: {
          DEBUG: 'false',
        },
      },
      Runtime: 'nodejs16.x',
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'MongoPostInstallLambdaSecurityGroup62729E3A',
              'GroupId',
            ],
          },
        ],
        SubnetIds: [
          {
            Ref: 'VpcPrivateSubnet1Subnet536B997A',
          },
          {
            Ref: 'VpcPrivateSubnet2Subnet3788AAA1',
          },
        ],
      },
    }));

    // Lambda role can get the required secrets.
    cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
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
                'ServerCert',
                'CertChain',
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
              Ref: 'MongoDbInstanceAdminUser54147F2B',
            },
          },
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: pwUser1Arn,
          },
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: pwUser2Arn,
          },
        ],
      },
    }));

    cdkExpect(stack).to(haveResourceLike('Custom::RFDK_MongoDbPostInstallSetup', {
      Properties: {
        Connection: {
          Hostname: 'mongodb.testZone.internal',
          Port: '27017',
          CaCertificate: {
            'Fn::GetAtt': [
              'ServerCert',
              'CertChain',
            ],
          },
          Credentials: {
            Ref: 'MongoDbInstanceAdminUser54147F2B',
          },
        },
        PasswordAuthUsers: [
          pwUser1Arn,
          pwUser2Arn,
        ],
        X509AuthUsers: [
          {
            Certificate: x509User1Arn,
            Roles: x509User1.roles,
          },
          {
            Certificate: x509User2Arn,
            Roles: x509User2.roles,
          },
        ],
      },
      DependsOn: [
        'MongoDbInstanceServerAsgASG2643AD1D',
        'MongoPostInstallLambdaServiceRoleDefaultPolicy8B1C1CE8',
        'MongoPostInstallLambdaServiceRoleCD03B9B9',
      ],
    }, ResourcePart.CompleteDefinition));
  });

  test('created correctly: only password users', () => {
    // GIVEN
    const users: MongoDbUsers = {
      passwordAuthUsers: [ pwUser1, pwUser2 ],
    };

    // WHEN
    new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
      vpc,
      mongoDb,
      users,
    });

    // THEN
    // Lambda role can get the required secrets.
    cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
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
                'ServerCert',
                'CertChain',
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
              Ref: 'MongoDbInstanceAdminUser54147F2B',
            },
          },
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: pwUser1Arn,
          },
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: pwUser2Arn,
          },
        ],
      },
    }));

    cdkExpect(stack).to(haveResource('Custom::RFDK_MongoDbPostInstallSetup', {
      Connection: {
        Hostname: 'mongodb.testZone.internal',
        Port: '27017',
        CaCertificate: {
          'Fn::GetAtt': [
            'ServerCert',
            'CertChain',
          ],
        },
        Credentials: {
          Ref: 'MongoDbInstanceAdminUser54147F2B',
        },
      },
      PasswordAuthUsers: [
        pwUser1Arn,
        pwUser2Arn,
      ],
    }));
  });

  test('created correctly: only x509 users', () => {
    // GIVEN
    const users: MongoDbUsers = {
      x509AuthUsers: [ x509User1, x509User2 ],
    };

    // WHEN
    new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
      vpc,
      mongoDb,
      users,
    });

    // THEN
    cdkExpect(stack).to(haveResource('Custom::RFDK_MongoDbPostInstallSetup', {
      Connection: {
        Hostname: 'mongodb.testZone.internal',
        Port: '27017',
        CaCertificate: {
          'Fn::GetAtt': [
            'ServerCert',
            'CertChain',
          ],
        },
        Credentials: {
          Ref: 'MongoDbInstanceAdminUser54147F2B',
        },
      },
      X509AuthUsers: [
        {
          Certificate: x509User1Arn,
          Roles: x509User1.roles,
        },
        {
          Certificate: x509User2Arn,
          Roles: x509User2.roles,
        },
      ],
    }));
  });

  test('use selected subnets', () => {
    // GIVEN
    const users: MongoDbUsers = {
      passwordAuthUsers: [ pwUser1, pwUser2 ],
      x509AuthUsers: [ x509User1, x509User2 ],
    };

    // WHEN
    new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
      vpc,
      vpcSubnets: { subnets: [ vpc.privateSubnets[0] ] },
      mongoDb,
      users,
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'mongodb.configureMongo',
      VpcConfig: {
        SubnetIds: [
          {
            Ref: 'VpcPrivateSubnet1Subnet536B997A',
          },
        ],
      },
    }));
  });

  test('assert bad x509 role', () => {
    // GIVEN
    const users: MongoDbUsers = {
      x509AuthUsers: [
        {
          certificate: x509User1.certificate,
          roles: '}{',
        },
      ],
    };

    // THEN
    expect(() => {
      new MongoDbPostInstallSetup(stack, 'MongoPostInstall', {
        vpc,
        mongoDb,
        users,
      });
    }).toThrowError(/MongoDbPostInstallSetup: Could not parse JSON role for x509 user:/);
  });

});
