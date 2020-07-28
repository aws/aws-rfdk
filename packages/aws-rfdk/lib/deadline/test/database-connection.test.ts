/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  ResourcePart,
} from '@aws-cdk/assert';
import {
  DatabaseCluster,
} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  SecurityGroup,
  SubnetType,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  AccountRootPrincipal,
  Role,
} from '@aws-cdk/aws-iam';
import {
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Stack,
} from '@aws-cdk/core';

import {
  IMongoDb,
  MongoDbInstance,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  X509CertificatePem,
} from '../../core/lib';
import {
  escapeTokenRegex,
} from '../../core/test/token-regex-helpers';
import {
  DatabaseConnection,
} from '../lib';

describe('DocumentDB', () => {
  let stack: Stack;
  let vpc: Vpc;
  let database: DatabaseCluster;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');

    database = new DatabaseCluster(stack, 'DbCluster', {
      masterUser: {
        username: 'master',
      },
      instanceProps: {
        instanceType: InstanceType.of(
          InstanceClass.R5,
          InstanceSize.XLARGE,
        ),
        vpc,
        vpcSubnets: {
          onePerAz: true,
          subnetType: SubnetType.PRIVATE,
        },
      },
    });

    if (!database.secret) {
      throw new Error('secret cannot be null');
    }
  });

  test('Grants access to Document DB Secret', () => {
    // GIVEN
    const role = new Role(stack, 'Role', {assumedBy: new AccountRootPrincipal()});
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});

    // WHEN
    connection.grantRead(role);

    // THEN
    expectCDK(stack).to(haveResource('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {Ref: 'DbClusterSecretAttachment4201A1ED'},
        }],
      },
    }));
  });

  test('addInstallerDBArgs defines required elements', () => {
    // GIVEN
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addInstallerDBArgs(instance);
    const userData = instance.userData.render();

    // THEN
    expect(userData).toContain('configure_database_installation_args(){\n');
    expect(userData).toContain('\nexport -f configure_database_installation_args');
    expect(userData).toContain('\nINSTALLER_DB_ARGS=(');
  });

  test('allow connection', () => {
    // GIVEN
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});
    const securityGroup = new SecurityGroup(stack, 'SG', {
      vpc,
    });

    // WHEN
    connection.allowConnectionsFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: {
        'Fn::GetAtt': [
          'DbCluster224236EF',
          'Port',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'SGADB53937',
          'GroupId',
        ],
      },
      ToPort: {
        'Fn::GetAtt': [
          'DbCluster224236EF',
          'Port',
        ],
      },
    }));
  });

  test('add child dependency', () => {
    // GIVEN
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addChildDependency(instance);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::Instance', {
      DependsOn: [
        'DbClusterInstance155835CE5',
        'InstanceInstanceRoleE9785DE5',
      ],
    }, ResourcePart.CompleteDefinition));
  });

  test('add child dependency to attributes', () => {
    // GIVEN
    const docdb = DatabaseCluster.fromDatabaseClusterAttributes(stack, 'Database', {
      clusterEndpointAddress: 'addr',
      clusterIdentifier: 'identifier',
      instanceEndpointAddresses: ['addr'],
      instanceIdentifiers: ['identifier'],
      port: 3306,
      readerEndpointAddress: 'reader-address',
      securityGroup: SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
        allowAllOutbound: false,
      }),
    });
    const connection = DatabaseConnection.forDocDB({database: docdb, login: database.secret!});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addChildDependency(instance);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::Instance', {
      DependsOn: [
        'InstanceInstanceRoleE9785DE5',
      ],
    }, ResourcePart.CompleteDefinition));
  });

  test('add child dependency throws when cluster implementation changed', () => {
    // GIVEN
    const docdb = DatabaseCluster.fromDatabaseClusterAttributes(stack, 'Database', {
      clusterEndpointAddress: 'addr',
      clusterIdentifier: 'identifier',
      instanceEndpointAddresses: ['addr'],
      instanceIdentifiers: ['identifier'],
      port: 3306,
      readerEndpointAddress: 'reader-address',
      securityGroup: SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
        allowAllOutbound: false,
      }),
    });
    const connection = DatabaseConnection.forDocDB({database: docdb, login: database.secret!});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    docdb.node.defaultChild = database; // Trick addChildDependency() into thinking this is a real construct.

    // THEN
    expect(() => {
      connection.addChildDependency(instance);
    }).toThrowError(/The internal implementation of the AWS CDK's DocumentDB cluster construct may have changed./);
  });

  test('asserts linux-only', () => {
    // GIVEN
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});

    // WHEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });

    // THEN
    expect(() => {
      connection.addInstallerDBArgs(instance);
    }).toThrowError('Can only install Deadline from a Linux instance.');
    expect(() => {
      connection.addConnectionDBArgs(instance);
    }).toThrowError('Connecting to the Deadline Database is currently only supported for Linux.');
  });

});

describe('MongoDB', () => {
  let stack: Stack;
  let vpc: Vpc;
  let database: IMongoDb;
  let clientCert: X509CertificatePem;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');
    const hostname = 'mongo';
    const zoneName = 'deadline.internal';
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
    clientCert = new X509CertificatePem(stack, 'ClientCert', {
      subject: {
        cn: 'dbuser',
        ou: 'TestClient',
      },
      signingCertificate: caCert,
    });

    database = new MongoDbInstance(stack, 'MongoDb', {
      vpc,
      mongoDb: {
        userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
        version: MongoDbVersion.COMMUNITY_3_6,
        hostname,
        dnsZone,
        serverCertificate: serverCert,
      },
    });
  });

  test('Grants access to certificate Secrets', () => {
    // GIVEN
    const role = new Role(stack, 'Role', {assumedBy: new AccountRootPrincipal()});
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});

    // WHEN
    connection.grantRead(role);

    // THEN
    expectCDK(stack).to(haveResource('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Resource: {
              'Fn::GetAtt': [
                'ClientCert',
                'Cert',
              ],
            },
          },
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Resource: {
              Ref: 'ClientCertPassphrase8A71E1E1',
            },
          },
        ],
      },
    }));
  });

  test('addInstallerDBArgs defines required elements', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addInstallerDBArgs(instance);
    const userData = instance.userData.render();

    // THEN
    const token = '${Token[TOKEN.\\d+]}';
    expect(userData).toMatch(new RegExp(escapeTokenRegex('\'/tmp/' + token + token + '\' ' + token + ' /opt/Thinkbox/certs/mongo_client.pfx')));
    expect(userData).toContain('configure_database_installation_args(){\n');
    expect(userData).toContain('\nexport -f configure_database_installation_args');
    expect(userData).toContain('{ set +x; } 2>/dev/null');
    expect(userData).toContain('\nINSTALLER_DB_ARGS=( ["--dbssl"]=true ["--dbauth"]=true ["--dbsslauth"]=true');
    expect(userData).toContain('["--dbhost"]="mongo.deadline.internal"');
    expect(userData).toContain('["--dbport"]=27017');
    expect(userData).toContain('["--dbclientcert"]=');
    expect(userData).toContain('["--dbcertpass"]=$CERT_PASSWORD');
  });

  test('addConnectionDBArgs defines required elements', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addConnectionDBArgs(instance);
    const userData = instance.userData.render();

    // THEN
    const token = '${Token[TOKEN.\\d+]}';
    expect(userData).toMatch(new RegExp(escapeTokenRegex('\'/tmp/' + token + token + '\' ' + token + ' /opt/Thinkbox/certs/mongo_client.pfx')));
    expect(userData).toContain('configure_deadline_database(){\n');
    expect(userData).toContain('\nexport -f configure_deadline_database');
    expect(userData).toContain('{ set +x; } 2>/dev/null');
    expect(userData).toContain('\nexport DB_CERT_FILE=');
    expect(userData).toContain('\nexport DB_CERT_PASSWORD=');
  });

  test('defines required container environment variables', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});

    // THEN
    expect(connection.containerEnvironment).toHaveProperty('DB_TLS_CLIENT_CERT_URI');
    expect(connection.containerEnvironment).toHaveProperty('DB_TLS_CLIENT_CERT_PASSWORD_URI');
  });

  test('allow connection', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});
    const securityGroup = new SecurityGroup(stack, 'SG', {
      vpc,
    });

    // WHEN
    connection.allowConnectionsFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 27017,
      ToPort: 27017,
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'SGADB53937',
          'GroupId',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          'MongoDbServerAsgInstanceSecurityGroupCE623335',
          'GroupId',
        ],
      },
    }));
  });

  test('add child dependency', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    connection.addChildDependency(instance);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::Instance', {
      DependsOn: [
        'InstanceInstanceRoleE9785DE5',
        'MongoDbServerAsgASG47B3D94E',
      ],
    }, ResourcePart.CompleteDefinition));
  });

  test('asserts linux-only', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});

    // WHEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });

    // THEN
    expect(() => {
      connection.addInstallerDBArgs(instance);
    }).toThrowError('Can only install Deadline from a Linux instance.');
    expect(() => {
      connection.addConnectionDBArgs(instance);
    }).toThrowError('Connecting to the Deadline Database is currently only supported for Linux.');
  });
});