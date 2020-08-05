/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  countResourcesLike,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  ResourcePart,
} from '@aws-cdk/assert';
import {AutoScalingGroup} from '@aws-cdk/aws-autoscaling';
import {DatabaseCluster} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  MachineImage,
  Subnet,
  SubnetType,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  FileSystem as EfsFileSystem,
} from '@aws-cdk/aws-efs';
import {
  Bucket,
} from '@aws-cdk/aws-s3';
import {
  App,
  Duration,
  RemovalPolicy,
  Stack,
} from '@aws-cdk/core';
import {
  MountableEfs,
} from '../../core';
import {
  DatabaseConnection,
  IVersion,
  Repository,
  VersionQuery,
} from '../lib';
import {
  REPO_DC_ASSET,
} from './asset-constants';

let stack: Stack;
let vpc: IVpc;
let deadlineVersion: IVersion;

function escapeTokenRegex(s: string): string {
  // A CDK Token looks like: ${Token[TOKEN.12]}
  // This contains the regex special characters: ., $, {, }, [, and ]
  // Escape those for use in a regex.
  return s.replace(/[.${}[\]]/g, '\\$&');
}

beforeEach(() => {
  stack = new Stack();
  vpc = new Vpc(stack, 'VPC');
  deadlineVersion = VersionQuery.exact(stack, 'Version', {
    majorVersion: 10,
    minorVersion: 1,
    releaseVersion: 9,
    patchVersion: 2,
  });
});

test('can create two repositories', () => {
  // GIVEN
  new Repository(stack, 'Repo1', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expect(() => {
    new Repository(stack, 'Repo2', {
      vpc,
      version: deadlineVersion,
    });
  }).not.toThrow();
});

test('repository installer instance is created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    Properties: {
      MaxSize: '1',
      MinSize: '1',
    },
    CreationPolicy: {
      AutoScalingCreationPolicy: {
        MinSuccessfulInstancesPercent: 100,
      },
      ResourceSignal: {
        Timeout: 'PT15M',
      },
    },
    UpdatePolicy: {
      AutoScalingReplacingUpdate: {
        WillReplace: true,
      },
      AutoScalingScheduledAction: {
        IgnoreUnmodifiedGroupSizeProperties: true,
      },
    },
    DependsOn: [
      'repositoryInstallerDocumentDatabaseInstance11A6F8C8E',
    ],
  }, ResourcePart.CompleteDefinition));
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't3.large',
  }));

  expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    FromPort: 2049,
    ToPort: 2049,
    GroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerFileSystemEfsSecurityGroup289D043C',
        'GroupId',
      ],
    },
    SourceSecurityGroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerInstanceSecurityGroup0B5705D3',
        'GroupId',
      ],
    },
  }));
});

test('repository installer security groups created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    FromPort: 2049,
    ToPort: 2049,
    GroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerFileSystemEfsSecurityGroup289D043C',
        'GroupId',
      ],
    },
    SourceSecurityGroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerInstanceSecurityGroup0B5705D3',
        'GroupId',
      ],
    },
  }));
  expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    FromPort: {
      'Fn::GetAtt': [
        'repositoryInstallerDocumentDatabaseA36CE7FE',
        'Port',
      ],
    },
    ToPort: {
      'Fn::GetAtt': [
        'repositoryInstallerDocumentDatabaseA36CE7FE',
        'Port',
      ],
    },
    GroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerDocumentDatabaseSecurityGroupBEFDC58F',
        'GroupId',
      ],
    },
    SourceSecurityGroupId: {
      'Fn::GetAtt': [
        'repositoryInstallerInstanceSecurityGroup0B5705D3',
        'GroupId',
      ],
    },
  }));
});

/*
IAM Policy document tests. The policy for the installer instance is:
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {}, // CloudWatch log group put
        {}, // cloudwatch agent install script
        {}, // cloudwatch agent string parameters
        {}, // cloudwatch agent get installer permissions
        {}, // DocDB secret get
        {}, // filesystem mount script get
        {}, // installer get
        {}, // repository installation script asset get
        {}, // update autoscaling policy
        {}, // describe tags
      ],
    },
  }));

  We only explicitly test for the permissions we explicitly add:
    - docDB secret get
    - installer get
    - autoscaling policy (handled by: 'alidate instance self-termination' test)
    - describe tags (handled by: 'alidate instance self-termination' test)
  The others are side-effects of adding the cloudwatch agent, and mounting the filesystem.
  We make sure that we do those things in other ways, and trust to their constructs to be
  verifying proper permissions.
 */

test('repository installer iam permissions: db secret access', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {},
        {},
        {},
        {},
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: {
            Ref: 'repositoryInstallerDocumentDatabaseSecretAttachment29753B7C',
          },
        },
        {},
        {},
        {},
        {},
        {},
      ],
    },
  }));
});

test('repository installer iam permissions: installer get', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: arrayWith(
        {
          Action: [
            's3:GetObject*',
            's3:GetBucket*',
            's3:List*',
          ],
          Effect: 'Allow',
          Resource: arrayWith(
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':s3:::thinkbox-installers',
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
                  ':s3:::thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineRepository-10.1.9.2-linux-x64-installer.run',
                ],
              ],
            },
          ),
        },
      ),
    },
  }));
});

test('default repository installer log group created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: '/renderfarm/repositoryInstaller',
  }));
});

test('repository installer logs all required files', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // THEN
  // The CloudWatchAgent stores the agent configuration in an SSM Parameter. Check it for the required setup.
  // Note: This would be better implemented using the tools in: https://github.com/aws/aws-cdk/pull/8444
  // but that is not yet available.
  expectCDK(stack).to(haveResourceLike('AWS::SSM::Parameter', {
    Type: 'String',
    Value: {
      'Fn::Join': [
        '',
        [
          '{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"log_group_name\":\"',
          {}, // log group name. checked in another test.
          '\",\"log_stream_name\":\"cloud-init-output-{instance_id}\",\"file_path\":\"/var/log/cloud-init-output.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
          {}, // log group name again.
          '\",\"log_stream_name\":\"deadlineRepositoryInstallationLogs-{instance_id}\",\"file_path\":\"/tmp/bitrock_installer.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
        ],
      ],
    },
  }));
});

test('repository mounts repository filesystem', () => {
  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
  });

  // WHEN
  const userData = (repo.node.defaultChild as AutoScalingGroup).userData.render();

  // THEN
  expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 rw')));
});

test('repository creates deadlineDatabase if none provided', () => {
  const testEFS = new EfsFileSystem(stack, 'TestEfsFileSystem', {
    vpc,
  });
  const testFS = new MountableEfs(stack, {
    filesystem: testEFS,
  });

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    fileSystem: testFS,
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::DocDB::DBCluster'));
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBInstance', {
    AutoMinorVersionUpgrade: true,
  }));
});

test('honors subnet specification', () => {
  // GIVEN
  const app = new App();
  const dependencyStack = new Stack(app, 'DepStack');
  const dependencyVpc = new Vpc(dependencyStack, 'DepVpc');

  const subnets = [
    Subnet.fromSubnetAttributes(dependencyStack, 'Subnet1', {
      subnetId: 'SubnetID1',
      availabilityZone: 'us-west-2a',
    }),
    Subnet.fromSubnetAttributes(dependencyStack, 'Subnet2', {
      subnetId: 'SubnetID2',
      availabilityZone: 'us-west-2b',
    }),
  ];
  const isolatedStack = new Stack(app, 'IsolatedStack');

  // WHEN
  new Repository(isolatedStack, 'repositoryInstaller', {
    vpc: dependencyVpc,
    version: deadlineVersion,
    vpcSubnets: {
      subnets,
    },
  });

  // THEN
  expectCDK(isolatedStack).to(haveResourceLike('AWS::DocDB::DBSubnetGroup', {
    SubnetIds: [
      'SubnetID1',
      'SubnetID2',
    ],
  }));
  expectCDK(isolatedStack).to(haveResourceLike('AWS::EFS::MountTarget', { SubnetId: 'SubnetID1' }));
  expectCDK(isolatedStack).to(haveResourceLike('AWS::EFS::MountTarget', { SubnetId: 'SubnetID2' }));
});

test('repository honors database instance count', () => {
  // GIVEN
  const instanceCount = 2;

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    documentDbInstanceCount: instanceCount,
  });

  // THEN
  expectCDK(stack).to(countResourcesLike('AWS::DocDB::DBInstance', instanceCount, {
    AutoMinorVersionUpgrade: true,
  }));
});

test('repository honors database removal policy', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    databaseRemovalPolicy: RemovalPolicy.DESTROY,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBCluster', {
    DeletionPolicy: 'Delete',
  }, ResourcePart.CompleteDefinition));
});

test('repository honors database retention period', () => {
  // GIVEN
  const period = 20;

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    backupOptions: {
      databaseRetention: Duration.days(period),
    },
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBCluster', {
    BackupRetentionPeriod: period,
  }));
});

test('warns if both retention period and database provided', () => {
  // GIVEN
  const fsDatabase = new DatabaseCluster(stack, 'TestDbCluster', {
    masterUser: {
      username: 'master',
    },
    instanceProps: {
      instanceType: InstanceType.of(
        InstanceClass.R4,
        InstanceSize.LARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE,
      },
    },
  });

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret! }),
    version: deadlineVersion,
    backupOptions: {
      databaseRetention: Duration.days(20),
    },
  });

  // THEN
  expect(repo.node.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: 'Backup retention for database will not be applied since a database is not being created by this construct',
      }),
    ]),
  );
});

test('repository creates filesystem if none provided', () => {

  const fsDatabase = new DatabaseCluster(stack, 'TestDbCluster', {
    masterUser: {
      username: 'master',
    },
    instanceProps: {
      instanceType: InstanceType.of(
        InstanceClass.R4,
        InstanceSize.LARGE,
      ),
      vpc,
      vpcSubnets: {
        onePerAz: true,
        subnetType: SubnetType.PRIVATE,
      },
    },
    backup: {
      retention: Duration.days(15),
    },
  });

  if (!fsDatabase.secret) {
    throw new Error('secret cannot be null');
  }

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret }),
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::EFS::FileSystem'));
  expectCDK(stack).to(haveResource('AWS::EFS::MountTarget'));
});

test('default repository instance is created using user defined installation path prefix', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    repositoryInstallationPrefix: 'xyz',
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toMatch(/\/mnt\/efs\/fs1\/xyz/);
});

test('default repository instance is created using user defined installation path prefix with extra slashes in path', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    repositoryInstallationPrefix: '/xyz//',
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toMatch(/\/mnt\/efs\/fs1\/xyz/);
});

test('repository instance is created with user defined timeout', () => {
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: {
      AutoScalingCreationPolicy: {
        MinSuccessfulInstancesPercent: 100,
      },
      ResourceSignal: {
        Timeout: 'PT30M',
      },
    },
  }, ResourcePart.CompleteDefinition));
});

test('repository instance is created with correct installer path version', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toMatch(/10\.1\.9\.2/);
});

test('repository instance is created with correct LogGroup prefix', () => {
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: deadlineVersion,
    logGroupProps: {
      logGroupPrefix: 'test-prefix/',
    },
  });

  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    LogGroupName: 'test-prefix/repositoryInstaller',
  }));
});

test('validate instance self-termination', () => {
  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });

  // THEN
  const expectedString = 'function exitTrap(){\nexitCode=$?\nsleep 1m\nINSTANCE=\"$(curl http://169.254.169.254/latest/meta-data/instance-id)\"\nASG=\"$(aws --region ${Token[AWS::Region.4]} ec2 describe-tags --filters \"Name=resource-id,Values=${INSTANCE}\" \"Name=key,Values=aws:autoscaling:groupName\" --query \"Tags[0].Value\" --output text)\"\naws --region ${Token[AWS::Region.4]} autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 0 --max-size 0 --desired-capacity 0\n/opt/aws/bin/cfn-signal --stack Stack --resource repositoryInstallerASG7A08DC6A --region ${Token[AWS::Region.4]} -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n}';
  expect((repo.node.defaultChild as AutoScalingGroup).userData.render()).toMatch(expectedString);
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          Action: 'autoscaling:UpdateAutoScalingGroup',
          Condition: {
            StringEquals: {
              'autoscaling:ResourceTag/resourceLogicalId': 'repositoryInstaller',
            },
          },
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'ec2:DescribeTags',
          Effect: 'Allow',
          Resource: '*',
        },
      ],
    },
  }));
});

test('repository configure client instance', () => {
  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });
  const instance = new Instance(stack, 'Instance', {
    vpc,
    instanceType: new InstanceType('t3.small'),
    machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
  });

  // WHEN
  repo.configureClientInstance({
    host: instance,
    mountPoint: '/mnt/repository',
  });
  const userData = instance.userData.render();

  // THEN
  // white-box testing. If we mount the filesystem, then we've called: setupDirectConnect()
  expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/repository rw')));

  // Make sure we added the DB connection args
  expect(userData).toMatch(/.*export -f configure_deadline_database.*/);

  // Make sure we call the configureRepositoryDirectConnect script with appropriate argument.
  const regex = new RegExp(escapeTokenRegex('\'/tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \\"/mnt/repository/DeadlineRepository\\"'));
  expect(userData).toMatch(regex);
});

test('configureClientInstance uses singleton for repo config script', () => {
  // Note: If this test fails, then check the asset hash for REPO_DC_ASSET -- it may have changed.

  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });
  const instance1 = new Instance(stack, 'Instance1', {
    vpc,
    instanceType: new InstanceType('t3.small'),
    machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
  });
  const instance2 = new Instance(stack, 'Instance2', {
    vpc,
    instanceType: new InstanceType('t3.small'),
    machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
  });

  // WHEN
  repo.configureClientInstance({
    host: instance1,
    mountPoint: '/mnt/repository',
  });
  repo.configureClientInstance({
    host: instance2,
    mountPoint: '/mnt/repository',
  });

  // THEN
  // Make sure that both instances have access to the same Asset for the configureRepositoryDirectConnect script
  expectCDK(stack).to(countResourcesLike('AWS::IAM::Policy', 2, {
    PolicyDocument: {
      Statement: [
        {}, // secretsmanager:GetSecretValue for docdb secret
        {}, // asset access for EFS mount script
        {
          Effect: 'Allow',
          Action: [
            's3:GetObject*',
            's3:GetBucket*',
            's3:List*',
          ],
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
                    Ref: REPO_DC_ASSET.Bucket,
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
                    Ref: REPO_DC_ASSET.Bucket,
                  },
                  '/*',
                ],
              ],
            },
          ],
        },
      ],
    },
  }));
});

test('must provide linux repository installer', () => {
  // GIVEN
  const version: IVersion = {
    majorVersion: 10,
    minorVersion: 1,
    releaseVersion: 0,
    linuxFullVersionString: () => '10.1.0.3',
  };

  // THEN
  expect(() => {
    new Repository(stack, 'repositoryInstaller', {
      vpc,
      version,
    });
  }).toThrowError('Version given to Repository must provide a Linux Repository installer.');
});

test('must provide linux repository full version string', () => {
  // GIVEN
  const s3Bucket = Bucket.fromBucketName(stack, 'Bucket', 'someBucket');
  const version: IVersion = {
    majorVersion: 10,
    minorVersion: 1,
    releaseVersion: 0,
    linuxFullVersionString: () => undefined,
    linuxInstallers: {
      patchVersion: 1,
      repository: {
        s3Bucket,
        objectKey: 'somekey',
      },
    },
  };

  // THEN
  expect(() => {
    new Repository(stack, 'repositoryInstaller', {
      vpc,
      version,
    });
  }).toThrowError('Version given to Repository must provide a full Linux version string.');
});

test('windows client cannot direct connect to repository', () => {
  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version: deadlineVersion,
  });
  const instance = new Instance(stack, 'Instance', {
    vpc,
    instanceType: new InstanceType('t3.small'),
    machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
  });

  // THEN
  expect(() => {
    repo.configureClientInstance({
      host: instance,
      mountPoint: 'd:\\',
    });
  }).toThrowError('Deadline direct connect on Windows hosts is not yet supported by the RFDK.');
});