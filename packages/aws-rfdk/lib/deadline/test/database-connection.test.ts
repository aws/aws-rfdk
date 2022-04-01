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
  Endpoint,
  IDatabaseCluster,
} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxGeneration,
  Connections,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  SecurityGroup,
  SubnetType,
  Volume,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  AccountRootPrincipal,
  Role,
} from '@aws-cdk/aws-iam';
import {
  IPrivateHostedZone,
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Secret,
  SecretAttachmentTargetProps,
} from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  Duration,
  Resource,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';
import * as sinon from 'sinon';

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
      instanceType: InstanceType.of(
        InstanceClass.R5,
        InstanceSize.XLARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      backup: {
        retention: Duration.days(15),
      },
      engineVersion: '3.6.0',
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

  test('adds warning annotation when a security group cannot be added due to unsupported IDatabaseCluster implementation', () => {
    // GIVEN
    class FakeDatabaseCluster extends Resource implements IDatabaseCluster {
      public readonly clusterIdentifier: string = '';
      public readonly instanceIdentifiers: string[] = [];
      public readonly clusterEndpoint: Endpoint = new Endpoint('address', 123);
      public readonly clusterReadEndpoint: Endpoint = new Endpoint('readAddress', 123);
      public readonly instanceEndpoints: Endpoint[] = [];
      public readonly securityGroupId: string = '';
      public readonly connections: Connections = new Connections();

      public readonly stack: Stack;
      public readonly env: ResourceEnvironment;

      constructor(scope: Construct, id: string) {
        super(scope, id);
        this.stack = Stack.of(scope);
        this.env = {account: this.stack.account, region: this.stack.region};
      }

      asSecretAttachmentTarget(): SecretAttachmentTargetProps {
        throw new Error('Method not implemented.');
      }
    }
    const fakeDatabase = new FakeDatabaseCluster(stack, 'FakeDatabase');
    const securityGroup = new SecurityGroup(stack, 'NewSecurityGroup', { vpc });
    const connection = DatabaseConnection.forDocDB({database: fakeDatabase, login: database.secret!});

    // WHEN
    connection.addSecurityGroup(securityGroup);

    // THEN
    expect(fakeDatabase.node.metadataEntry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: expect.stringMatching(new RegExp(`Failed to add the following security groups to ${fakeDatabase.node.id}: .*\\. ` +
        'The \\"database\\" property passed to this class is not an instance of AWS CDK\'s DocumentDB cluster construct.')),
      }),
    ]));
  });

  // This test can be removed once the following CDK PR is merged:
  // https://github.com/aws/aws-cdk/pull/13290
  test('adds warning annotation when a security group cannot be added due to implementation changes in DatabaseCluster', () => {
    // GIVEN
    if (!database.node.tryRemoveChild('Resource')) {
      throw new Error('The internal implementation of AWS CDK\'s DocumentDB cluster construct has changed. The addSecurityGroup method needs to be updated.');
    }
    const securityGroup = new SecurityGroup(stack, 'NewSecurityGroup', { vpc });
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});

    // WHEN
    connection.addSecurityGroup(securityGroup);

    // THEN
    expect(database.node.metadataEntry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: expect.stringMatching(new RegExp(`Failed to add the following security groups to ${database.node.id}: .*\\. ` +
        'The internal implementation of AWS CDK\'s DocumentDB cluster construct has changed.')),
      }),
    ]));
  });

  test('Document DB connection is pointed to correct construct', () => {
    // GIVEN
    const connection = DatabaseConnection.forDocDB({database, login: database.secret!});

    // THEN
    expect(connection.databaseConstruct).toEqual(database);
  });
});

describe('DocumentDB Version Checks', () => {
  let stack: Stack;
  let vpc: Vpc;
  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');
  });

  test('Compatible version', () => {
    // GIVEN
    const database = new DatabaseCluster(stack, 'DbCluster', {
      masterUser: {
        username: 'master',
      },
      instanceType: InstanceType.of(
        InstanceClass.R5,
        InstanceSize.XLARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      backup: {
        retention: Duration.days(15),
      },
      engineVersion: '3.6.0',
    });

    // WHEN
    DatabaseConnection.forDocDB({database, login: database.secret!});

    // THEN
    expect(database.node.metadataEntry.length).toBe(0);
  });

  test('When from attributes', () => {
    // GIVEN
    const sg = new SecurityGroup(stack, 'SG', {
      vpc,
    });
    const secret = new Secret(stack, 'Secret');
    const database = DatabaseCluster.fromDatabaseClusterAttributes(stack, 'DbCluster', {
      clusterEndpointAddress: '1.2.3.4',
      clusterIdentifier: 'foo',
      instanceEndpointAddresses: [ '1.2.3.5' ],
      instanceIdentifiers: [ 'i0' ],
      port: 27001,
      readerEndpointAddress: '1.2.3.6',
      securityGroup: sg,
    });

    // WHEN
    const databaseConnection = DatabaseConnection.forDocDB({database, login: secret});

    // THEN
    expect(database.node.metadataEntry.length).toBe(0);
    expect(databaseConnection.databaseConstruct).toBeUndefined();
  });

  test('No engineVersion given', () => {
    // GIVEN
    const database = new DatabaseCluster(stack, 'DbCluster', {
      masterUser: {
        username: 'master',
      },
      instanceType: InstanceType.of(
        InstanceClass.R5,
        InstanceSize.XLARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      backup: {
        retention: Duration.days(15),
      },
    });

    // WHEN
    DatabaseConnection.forDocDB({database, login: database.secret!});

    // THEN
    expect(database.node.metadataEntry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'aws:cdk:error',
          data: 'engineVersion must be 3.6.0 to be compatible with Deadline',
        }),
      ]),
    );
  });

  test('engineVersion not 3.6.0', () => {
    // GIVEN
    const database = new DatabaseCluster(stack, 'DbCluster', {
      masterUser: {
        username: 'master',
      },
      instanceType: InstanceType.of(
        InstanceClass.R5,
        InstanceSize.XLARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      backup: {
        retention: Duration.days(15),
      },
      engineVersion: '4.0.0',
    });

    // WHEN
    DatabaseConnection.forDocDB({database, login: database.secret!});

    // THEN
    expect(database.node.metadataEntry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'aws:cdk:error',
          data: 'engineVersion must be 3.6.0 to be compatible with Deadline',
        }),
      ]),
    );
  });
});

describe('MongoDB', () => {
  let stack: Stack;
  let vpc: Vpc;
  let database: IMongoDb;
  let clientCert: X509CertificatePem;
  let dnsZone: IPrivateHostedZone;
  let serverCert: X509CertificatePem;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');
    const hostname = 'mongo';
    const zoneName = 'deadline.internal';
    dnsZone = new PrivateHostedZone(stack, 'PrivateHostedZone', {
      vpc,
      zoneName,
    });
    const caCert = new X509CertificatePem(stack, 'CaCert', {
      subject: {
        cn: 'DistinguishedName',
      },
    });
    serverCert = new X509CertificatePem(stack, 'ServerCert', {
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

  test('adds security group', () => {
    // GIVEN
    const dbSpy = sinon.spy(database, 'addSecurityGroup');
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});
    const securityGroup = new SecurityGroup(stack, 'NewSecurityGroup', {
      vpc,
    });

    // WHEN
    connection.addSecurityGroup(securityGroup);

    // THEN
    expect(dbSpy.calledOnce).toBeTruthy();
  });

  test('Mongo DB connection is pointed to correct construct', () => {
    // GIVEN
    const connection = DatabaseConnection.forMongoDbInstance({database, clientCertificate: clientCert});

    // THEN
    expect(connection.databaseConstruct).toEqual((<MongoDbInstance>database).mongoDataVolume);
  });

  test('Mongo DB imported from attributes', () => {
    // GIVEN
    const volume = Volume.fromVolumeAttributes(stack, 'Volume', {
      availabilityZone: 'dummy zone',
      volumeId: 'vol-05abe246af',
    });

    const mongoDB = new MongoDbInstance(stack, 'ImportedMongoDb', {
      vpc,
      mongoDb: {
        userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
        version: MongoDbVersion.COMMUNITY_3_6,
        hostname: 'mongo',
        dnsZone,
        serverCertificate: serverCert,
        mongoDataVolume: {volume},
      },
    });
    const connection = DatabaseConnection.forMongoDbInstance({database: mongoDB, clientCertificate: clientCert});

    // THEN
    expect(connection.databaseConstruct).toBeUndefined();
  });
});
