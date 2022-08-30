/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  Names,
  Size,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  InstanceType,
  SecurityGroup,
  SubnetType,
  Volume,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import {
  Key,
} from 'aws-cdk-lib/aws-kms';
import {
  RetentionDays,
} from 'aws-cdk-lib/aws-logs';
import {
  PrivateHostedZone,
} from 'aws-cdk-lib/aws-route53';
import {
  Secret,
} from 'aws-cdk-lib/aws-secretsmanager';

import {
  MongoDbInstance,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  X509CertificatePem,
} from '../lib';

import {
  CWA_ASSET_LINUX, INSTALL_MONGODB_3_6_SCRIPT_LINUX, MONGODB_3_6_CONFIGURATION_SCRIPTS, MOUNT_EBS_SCRIPT_LINUX,
} from './asset-constants';
import {
  testConstructTags,
} from './tag-helpers';

describe('Test MongoDbInstance', () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let dnsZone: PrivateHostedZone;
  let caCert: X509CertificatePem;
  let serverCert: X509CertificatePem;

  const hostname = 'hostname';
  const zoneName = 'testZone';
  const version = MongoDbVersion.COMMUNITY_3_6;
  const userSsplAcceptance = MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'Stack');
    vpc = new Vpc(stack, 'Vpc');
    dnsZone = new PrivateHostedZone(stack, 'PrivateHostedZone', {
      vpc,
      zoneName,
    });
    caCert = new X509CertificatePem(stack, 'CaCert', {
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
  });

  test('default mongodb instance is created correctly', () => {
    // WHEN
    const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
    });

    // THEN
    Template.fromStack(stack).resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: 'r5.large',
      BlockDeviceMappings: Match.arrayWith([
        Match.objectLike({
          Ebs: Match.objectLike({
            Encrypted: true,
          }),
        }),
      ]),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
      Name: hostname + '.' + zoneName + '.',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: `Admin credentials for the MongoDB database ${Names.uniqueId(instance)}`,
      GenerateSecretString: {
        ExcludeCharacters: '\"()$\'',
        ExcludePunctuation: true,
        GenerateStringKey: 'password',
        IncludeSpace: false,
        PasswordLength: 24,
        RequireEachIncludedType: true,
        SecretStringTemplate: '{\"username\":\"admin\"}',
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Volume', {
      Encrypted: true,
      Tags: Match.arrayWith([
        Match.objectLike({
          Key: 'VolumeGrantAttach-6238D22B12',
          Value: '6238d22b121db8094cb816e2a49d2b61',
        }),
      ]),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          {
            Action: 'cloudformation:SignalResource',
            Effect: 'Allow',
            Resource: {
              Ref: 'AWS::StackId',
            },
          },
          {
            Action: [
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':logs:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':log-group:',
                  {
                    'Fn::GetAtt': [
                      'MongoDbInstanceMongoDbInstanceLogGroupWrapperEAF733BB',
                      'LogGroupName',
                    ],
                  },
                  ':*',
                ],
              ],
            },
          },
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::',
                    {
                      'Fn::Sub': CWA_ASSET_LINUX.Bucket,
                    },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::',
                    {
                      'Fn::Sub': CWA_ASSET_LINUX.Bucket,
                    },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: [
              'ssm:DescribeParameters',
              'ssm:GetParameters',
              'ssm:GetParameter',
              'ssm:GetParameterHistory',
            ],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':ssm:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':parameter/',
                  {
                    Ref: Match.stringLikeRegexp('^MongoDbInstanceStringParameter.*'),
                  },
                ],
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
                'ServerCert',
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
              'Fn::GetAtt': [
                'ServerCert',
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
              Ref: Match.stringLikeRegexp('^ServerCertPassphrase.*'),
            },
          },
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: {
              Ref: Match.stringLikeRegexp('^MongoDbInstanceAdminUser.*'),
            },
          },
        ]),
      }),
    });

    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: '/renderfarm/MongoDbInstance',
    });

    const cloudInitLogPath = '/var/log/cloud-init-output.log';
    const cloudInitLogPrefix = 'cloud-init-output';
    const mongoLogPath = '/var/log/mongodb/mongod.log';
    const mongoLogPrefix = 'MongoDB';

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Description: 'config file for Repository logs config',
      Value: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            `\",\"log_stream_name\":\"${cloudInitLogPrefix}-{instance_id}\",\"file_path\":\"${cloudInitLogPath}\",` +
            '\"timezone\":\"Local\"},{\"log_group_name\":\"',
            `\",\"log_stream_name\":\"${mongoLogPrefix}-{instance_id}\",\"file_path\":\"${mongoLogPath}\"` +
            ',\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
          ]),
        ],
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            Match.arrayWith([
              // Make sure we add signal on exit
              '#!/bin/bash\n' +
              'function exitTrap(){\n' +
              'exitCode=$?\n' +
              '/opt/aws/bin/cfn-signal --stack Stack --resource MongoDbInstanceServerAsgASG2643AD1D --region ',
              {
                Ref: 'AWS::Region',
              },
              ' -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n' +
              'test "${MONGO_SETUP_DIR}" != "" && sudo umount "${MONGO_SETUP_DIR}"\n' +
              '}\n' +
              // Set up the exit trap
              'trap exitTrap EXIT\n' +
              // Script settings
              'set -xefuo pipefail\n' +
              // Setup CloudWatch agent
              `mkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\n` +
              'aws s3 cp \'s3://',
              {
                'Fn::Sub': CWA_ASSET_LINUX.Bucket,
              },
              `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n` +
              'set -e\n' +
              `chmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh' -i `,
              {
                Ref: 'AWS::Region',
              },
              ' ',
              {
                Ref: Match.stringLikeRegexp('^MongoDbInstanceStringParameter.*'),
              },
              // Make sure we mount the EBS Volume
              `\nmkdir -p $(dirname '/tmp/${MOUNT_EBS_SCRIPT_LINUX.Key}.zip')\n` +
              'aws s3 cp \'s3://',
              {
                'Fn::Sub': MOUNT_EBS_SCRIPT_LINUX.Bucket,
              },
              `/${MOUNT_EBS_SCRIPT_LINUX.Key}.zip' '/tmp/${MOUNT_EBS_SCRIPT_LINUX.Key}.zip'\n` +
              'TMPDIR=$(mktemp -d)\n' +
              'pushd "$TMPDIR"\n' +
              `unzip /tmp/${MOUNT_EBS_SCRIPT_LINUX.Key}.zip\n` +
              'bash ./mountEbsBlockVolume.sh ',
              {
                Ref: Match.stringLikeRegexp('^MongoDbInstanceMongoDbData.*'),
              },
              ' xfs /var/lib/mongo rw ""\n' +
              'popd\n' +
              `rm -f /tmp/${MOUNT_EBS_SCRIPT_LINUX.Key}.zip\n` +
              // Install MongoDB
              `mkdir -p $(dirname '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh')\n` +
              'aws s3 cp \'s3://',
              {
                'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
              },
              `/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh' '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh'\n` +
              `bash /tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh\n` +
              // Fetching the MongoDB configuration scripts
              `mkdir -p $(dirname '/tmp/${MONGODB_3_6_CONFIGURATION_SCRIPTS.Key}.zip')\n` +
              'aws s3 cp \'s3://',
              {
                'Fn::Sub': MONGODB_3_6_CONFIGURATION_SCRIPTS.Bucket,
              },
              `/${MONGODB_3_6_CONFIGURATION_SCRIPTS.Key}.zip' '/tmp/${MONGODB_3_6_CONFIGURATION_SCRIPTS.Key}.zip'\n` +
              // Configure MongoDB
              'which mongod && test -f /etc/mongod.conf\n' +
              'sudo service mongod stop\n' +
              'MONGO_SETUP_DIR=$(mktemp -d)\n' +
              'mkdir -p "${MONGO_SETUP_DIR}"\n' +
              'sudo mount -t tmpfs -o size=50M tmpfs "${MONGO_SETUP_DIR}"\n' +
              'pushd "${MONGO_SETUP_DIR}"\n' +
              `unzip /tmp/${MONGODB_3_6_CONFIGURATION_SCRIPTS.Key}.zip\n` +
              'cp /etc/mongod.conf .\n' +
              // Getting the server certificate
              'bash serverCertFromSecrets.sh \"',
              {
                'Fn::GetAtt': [
                  'ServerCert',
                  'Cert',
                ],
              },
              '" "',
              {
                'Fn::GetAtt': [
                  'ServerCert',
                  'CertChain',
                ],
              },
              '" "',
              {
                'Fn::GetAtt': [
                  'ServerCert',
                  'Key',
                ],
              },
              '" "',
              {
                Ref: Match.stringLikeRegexp('^ServerCertPassphrase.*'),
              },
              '"\n' +
              // Set mongodb certificates and credentials
              'sudo mkdir -p /etc/mongod_certs\n' +
              'sudo mv ./ca.crt ./key.pem /etc/mongod_certs\n' +
              'sudo chown root.mongod -R /etc/mongod_certs/\n' +
              'sudo chmod 640 -R /etc/mongod_certs/\n' +
              'sudo chmod 750 /etc/mongod_certs/\n' +
              'sudo chown mongod.mongod -R /var/lib/mongo\n' +
              'bash ./setMongoLimits.sh\n' +
              'bash ./setStoragePath.sh "/var/lib/mongo"\n' +
              'bash ./setMongoNoAuth.sh\n' +
              'sudo service mongod start\n' +
              'bash ./setAdminCredentials.sh \"',
              {
                Ref: Match.stringLikeRegexp('^MongoDbInstanceAdminUser.*'),
              },
              '"\n' +
              // Setup for live deployment, and start mongod
              'sudo service mongod stop\n' +
              'bash ./setLiveConfiguration.sh\n' +
              'sudo systemctl enable mongod\n' +
              'sudo service mongod start\n' +
              'popd',
            ]),
          ],
        },
      },
    });

    // Make sure all the required public members are set
    expect(instance.version).toBe(version);

    expect(instance.connections).toBeDefined();
    expect(instance.connections).toBe(instance.server.connections);

    expect(instance.grantPrincipal).toBeDefined();
    expect(instance.grantPrincipal).toBe(instance.server.grantPrincipal);

    expect(instance.port).toBeDefined();

    expect(instance.role).toBeDefined();
    expect(instance.role).toBe(instance.server.role);

    expect(instance.userData).toBeDefined();
    expect(instance.userData).toBe(instance.server.userData);

    expect(instance.fullHostname).toBeDefined();
  });

  test('throw exception when no available subnets', () => {
    // GIVEN
    const invalidSubnets = {
      subnetType: SubnetType.PRIVATE_WITH_NAT,
      availabilityZones: ['dummy zone'],
    };

    // THEN
    expect(() => {
      new MongoDbInstance(stack, 'MongoDbInstance', {
        mongoDb: {
          version,
          dnsZone,
          hostname,
          serverCertificate: serverCert,
          userSsplAcceptance,
        },
        vpc,
        vpcSubnets: invalidSubnets,
      });
    }).toThrowError(/Did not find any subnets matching/);
  });

  test('changing instance type works correctly', () => {
    // GIVEN
    const expectedInstanceType = 'm4.micro';

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      instanceType: new InstanceType(expectedInstanceType),
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: expectedInstanceType,
    });
  });

  test('allowing ssh connection with key name', () => {
    // GIVEN
    const expectedKeyName = 'someKeyName';

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      keyName: expectedKeyName,
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      KeyName: expectedKeyName,
    });
  });

  test('using custom admin user works correctly', () => {
    // GIVEN
    const expectedAdminUser = new Secret(stack, 'AdminUser', {
      description: 'Custom admin credentials for the MongoDB database',
      generateSecretString: {
        excludeCharacters: '"()$\'',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 24,
        requireEachIncludedType: true,
        generateStringKey: 'test_password',
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
      },
    });

    // WHEN
    const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        adminUser: expectedAdminUser,
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
    });

    // THEN
    expect(instance.adminUser).toBe(expectedAdminUser);
  });

  test('setting security group works correctly', () => {
    // GIVEN
    const actualSecurityGroup = new SecurityGroup(stack, 'SecurityGroup', {
      securityGroupName: 'CustomSecurityGroup',
      vpc,
    });

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      securityGroup: actualSecurityGroup,
    });

    // THEN
    Template.fromStack(stack).resourceCountIs('AWS::EC2::SecurityGroup', 1);
  });

  test('setting role works correctly', () => {
    // GIVEN
    const expectedRole = new Role(stack, 'Role', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      roleName: 'CustomRole',
    });

    // WHEN
    const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      role: expectedRole,
    });

    // THEN
    expect(instance.server.role).toBe(expectedRole);
    expect(instance.role).toBe(expectedRole);
  });

  test('setting custom data volume works correctly', () => {
    // GIVEN
    const actualVolume = new Volume(stack, 'Volume', {
      availabilityZone: 'us-east-1a',
      size: Size.gibibytes(50),
    });

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
        mongoDataVolume: {
          volume: actualVolume,
        },
      },
      vpc,
    });

    // THEN
    Template.fromStack(stack).resourceCountIs('AWS::EC2::Volume', 1);
  });

  test('setting custom encryption key for data volume works correctly', () => {
    // GIVEN
    // KmsKeyId is Key961B73FD
    const actualEncryptionKey = new Key(stack, 'Key', {
      description: 'Key for testing',
    });

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
        mongoDataVolume: {
          volumeProps: {
            encryptionKey: actualEncryptionKey,
          },
        },
      },
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Volume', {
      Encrypted: true,
      KmsKeyId: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([
          'Key961B73FD',
        ]),
      }),
    });
  });

  test('setting custom size for data volume works correctly', () => {
    // GIVEN
    const volumeSize = 123;

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
        mongoDataVolume: {
          volumeProps: {
            size: Size.gibibytes(volumeSize),
          },
        },
      },
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Volume', {
      Size: volumeSize,
    });
  });

  test('setting LogGroup bucket name enables export to S3', () => {
    // GIVEN
    const bucketName = 'test-bucket';

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      logGroupProps: {
        bucketName,
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
      Targets: Match.arrayWith([Match.objectLike({
        Input: '{\"BucketName\":\"' + bucketName + '\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"/renderfarm/MongoDbInstance\",\"RetentionInHours\":72}',
      })]),
    });
  });

  test.each([
    'test-prefix/',
    '',
  ])('is created with correct LogGroup prefix %s', (testPrefix: string) => {
    // GIVEN
    const id = 'MongoDbInstance';

    // WHEN
    new MongoDbInstance(stack, id, {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      logGroupProps: {
        logGroupPrefix: testPrefix,
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: testPrefix + id,
    });
  });

  test('is created with correct LogGroup retention', () => {
    // GIVEN
    const retention = RetentionDays.ONE_DAY;

    // WHEN
    new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
      logGroupProps: {
        retention,
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      RetentionInDays: retention,
    });
  });

  test('adds security group', () => {
    // GIVEN
    const securityGroup = new SecurityGroup(stack, 'NewSecurityGroup', {
      vpc,
    });
    const instance = new MongoDbInstance(stack, 'MongoDbInstance', {
      mongoDb: {
        version,
        dnsZone,
        hostname,
        serverCertificate: serverCert,
        userSsplAcceptance,
      },
      vpc,
    });

    // WHEN
    instance.addSecurityGroup(securityGroup);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      SecurityGroups: Match.arrayWith([stack.resolve(securityGroup.securityGroupId)]),
    });
  });

  testConstructTags({
    constructName: 'MongoDbInstance',
    createConstruct: () => {
      const isolatedStack = new Stack(app, 'IsolatedStack');
      new MongoDbInstance(isolatedStack, 'MongoDbInstance', {
        mongoDb: {
          version,
          dnsZone,
          hostname,
          serverCertificate: serverCert,
          userSsplAcceptance,
        },
        vpc,
      });
      return isolatedStack;
    },
    resourceTypeCounts: {
      'AWS::EC2::SecurityGroup': 1,
      'AWS::IAM::Role': 1,
      'AWS::AutoScaling::AutoScalingGroup': 1,
      'AWS::EC2::NetworkInterface': 1,
      'AWS::SecretsManager::Secret': 1,
      'AWS::EC2::Volume': 1,
      'AWS::SSM::Parameter': 1,
    },
  });
});
