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
  SynthUtils,
} from '@aws-cdk/assert';
import {AutoScalingGroup} from '@aws-cdk/aws-autoscaling';
import {DatabaseCluster} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  IVpc,
  MachineImage,
  SecurityGroup,
  Subnet,
  SubnetType,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  AccessPoint,
  CfnFileSystem,
  FileSystem as EfsFileSystem,
} from '@aws-cdk/aws-efs';
import { Bucket } from '@aws-cdk/aws-s3';
import { Asset } from '@aws-cdk/aws-s3-assets';
import {
  App,
  CfnElement,
  Duration,
  Names,
  RemovalPolicy,
  Stack,
} from '@aws-cdk/core';

import {
  MountableEfs,
} from '../../core';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  CWA_ASSET_LINUX,
} from '../../deadline/test/asset-constants';
import {
  DatabaseConnection,
  IVersion,
  Repository,
  VersionQuery,
  Version,
} from '../lib';
import {
  REPO_DC_ASSET,
} from './asset-constants';

let app: App;
let stack: Stack;
let vpc: IVpc;
let version: IVersion;

function escapeTokenRegex(s: string): string {
  // A CDK Token looks like: ${Token[TOKEN.12]}
  // This contains the regex special characters: ., $, {, }, [, and ]
  // Escape those for use in a regex.
  return s.replace(/[.${}[\]]/g, '\\$&');
}

beforeEach(() => {
  app = new App();
  stack = new Stack(app, 'Stack');
  vpc = new Vpc(stack, 'VPC', {
    subnetConfiguration: [
      {
        name: 'Public',
        subnetType: SubnetType.PUBLIC,
      },
      {
        name: 'Private',
        subnetType: SubnetType.PRIVATE,
      },
      {
        name: 'Isolated',
        subnetType: SubnetType.ISOLATED,
      },
    ],
  });

  class MockVersion extends Version implements IVersion {
    readonly linuxInstallers = {
      patchVersion: 0,
      repository: {
        objectKey: 'testInstaller',
        s3Bucket: new Bucket(stack, 'LinuxInstallerBucket'),
      },
    }

    public linuxFullVersionString() {
      return this.toString();
    }
  }

  version = new MockVersion([10,1,9,2]);
});

test('can create two repositories', () => {
  // GIVEN
  new Repository(stack, 'Repo1', {
    vpc,
    version,
  });

  // THEN
  expect(() => {
    new Repository(stack, 'Repo2', {
      vpc,
      version,
    });
  }).not.toThrow();
});

test('repository installer instance is created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    Properties: {
      MaxSize: '1',
      MinSize: '1',
      VPCZoneIdentifier: [
        {
          Ref: 'VPCPrivateSubnet1Subnet8BCA10E0',
        },
        {
          Ref: 'VPCPrivateSubnet2SubnetCFCDAA7A',
        },
      ],
    },
    CreationPolicy: {
      ResourceSignal: {
        Count: 1,
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

test('repository installer honors vpcSubnet', () => {
  // Note: Default is private subnets, so it's sufficient to test something other than
  // private subnets.

  // WHEN
  const isolatedSubnetIds = [ 'IsolatedSubnet1', 'IsolatedSubnet2' ];
  const attrVpc = Vpc.fromVpcAttributes(stack, 'TestVpc', {
    availabilityZones: ['us-east-1a', 'us-east-1b'],
    vpcId: 'vpcid',
    isolatedSubnetIds,
  });
  new Repository(stack, 'repositoryInstaller', {
    vpc: attrVpc,
    version,
    vpcSubnets: { subnetType: SubnetType.ISOLATED },
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: isolatedSubnetIds,
  }));
});

test('repository installer security groups created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
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
        {}, // gpg get installer permissions
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
    version,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: arrayWith({
        Action: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        Effect: 'Allow',
        Resource: {
          Ref: 'repositoryInstallerDocumentDatabaseSecretAttachment29753B7C',
        },
      }),
    },
  }));
});

test('repository installer iam permissions: installer get', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
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
                  ':s3:::',
                  {
                    Ref: CWA_ASSET_LINUX.Bucket,
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
                    Ref: CWA_ASSET_LINUX.Bucket,
                  },
                  '/*',
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
    version,
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
    version,
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
    version,
  });

  // WHEN
  const userData = (repo.node.defaultChild as AutoScalingGroup).userData.render();

  // THEN
  expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 false rw')));
});

test.each([
  [RemovalPolicy.DESTROY, 'Delete'],
  [RemovalPolicy.RETAIN, 'Retain'],
  [RemovalPolicy.SNAPSHOT, 'Snapshot'],
])('repository honors database removal policy: %p', (policy: RemovalPolicy, expected: string) => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
    removalPolicy: {
      database: policy,
    },
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBCluster', {
    DeletionPolicy: expected,
  }, ResourcePart.CompleteDefinition));
});

test.each([
  [RemovalPolicy.DESTROY, 'Delete'],
  [RemovalPolicy.RETAIN, 'Retain'],
  [RemovalPolicy.SNAPSHOT, 'Snapshot'],
])('repository honors filesystem removal policy: %p', (policy: RemovalPolicy, expected: string) => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
    removalPolicy: {
      filesystem: policy,
    },
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::EFS::FileSystem', {
    DeletionPolicy: expected,
  }, ResourcePart.CompleteDefinition));
});

test('repository warns if removal policy for filesystem when filesystem provided', () => {
  // GIVEN
  const testEFS = new EfsFileSystem(stack, 'TestEfsFileSystem', {
    vpc,
  });
  const testAP = new AccessPoint(stack, 'TestAccessPoint', {
    fileSystem: testEFS,
  });
  const testFS = new MountableEfs(stack, {
    filesystem: testEFS,
    accessPoint: testAP,
  });

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    fileSystem: testFS,
    version,
    removalPolicy: {
      filesystem: RemovalPolicy.DESTROY,
    },
  });

  // THEN
  expect(repo.node.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: 'RemovalPolicy for filesystem will not be applied since a filesystem is not being created by this construct',
      }),
    ]),
  );
});

test('repository warns if removal policy for database when database provided', () => {
  // GIVEN
  const fsDatabase = new DatabaseCluster(stack, 'TestDbCluster', {
    masterUser: {
      username: 'master',
    },
    instanceType: InstanceType.of(
      InstanceClass.R4,
      InstanceSize.LARGE,
    ),
    vpc,
    vpcSubnets: {
      onePerAz: true,
      subnetType: SubnetType.PRIVATE,
    },
  });

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret! }),
    version,
    removalPolicy: {
      database: RemovalPolicy.DESTROY,
    },
  });

  // THEN
  expect(repo.node.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: 'RemovalPolicy for database will not be applied since a database is not being created by this construct',
      }),
    ]),
  );
});

test('repository creates deadlineDatabase if none provided', () => {
  const testEFS = new EfsFileSystem(stack, 'TestEfsFileSystem', {
    vpc,
  });
  const testAP = new AccessPoint(stack, 'TestAccessPoint', {
    fileSystem: testEFS,
  });
  const testFS = new MountableEfs(stack, {
    filesystem: testEFS,
    accessPoint: testAP,
  });

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    fileSystem: testFS,
    version,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::DocDB::DBCluster'));
  expectCDK(stack).to(haveResource('AWS::DocDB::DBInstance'));
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBCluster', {
    EnableCloudwatchLogsExports: [ 'audit' ],
  }, ResourcePart.Properties));
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBClusterParameterGroup', {
    Parameters: {
      audit_logs: 'enabled',
    },
  }, ResourcePart.Properties));
  expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBInstance', {
    AutoMinorVersionUpgrade: true,
  }));
});

test('disabling Audit logging does not enable Cloudwatch audit logs', () => {
  const testEFS = new EfsFileSystem(stack, 'TestEfsFileSystem', {
    vpc,
  });
  const testAP = new AccessPoint(stack, 'TestAccessPoint', {
    fileSystem: testEFS,
  });
  const testFS = new MountableEfs(stack, {
    filesystem: testEFS,
    accessPoint: testAP,
  });

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    fileSystem: testFS,
    version,
    databaseAuditLogging: false,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::DocDB::DBCluster'));
  expectCDK(stack).notTo(haveResourceLike('AWS::DocDB::DBCluster', {
    EnableCloudwatchLogsExports: [ 'audit' ],
  }, ResourcePart.Properties));
  expectCDK(stack).notTo(haveResourceLike('AWS::DocDB::DBClusterParameterGroup', {
    Parameters: {
      audit_logs: 'enabled',
    },
  }, ResourcePart.Properties));
});

test('repository warns if databaseAuditLogging defined and database is specified', () => {
  // GIVEN
  const fsDatabase = new DatabaseCluster(stack, 'TestDbCluster', {
    masterUser: {
      username: 'master',
    },
    instanceType: InstanceType.of(
      InstanceClass.R4,
      InstanceSize.LARGE,
    ),
    vpc,
    vpcSubnets: {
      onePerAz: true,
      subnetType: SubnetType.PRIVATE,
    },
  });

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
    removalPolicy: {
      filesystem: RemovalPolicy.DESTROY,
    },
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret! }),
    databaseAuditLogging: true,
  });

  const warningMsg = 'The parameter databaseAuditLogging only has an effect when the Repository is creating its own database.\n' +
    'Please ensure that the Database provided is configured correctly.';

  // THEN
  expect(repo.node.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'aws:cdk:warning',
        data: warningMsg,
      }),
    ]),
  );
});

test('honors subnet specification', () => {
  // GIVEN
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
    version,
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
    version,
    documentDbInstanceCount: instanceCount,
  });

  // THEN
  expectCDK(stack).to(countResourcesLike('AWS::DocDB::DBInstance', instanceCount, {
    AutoMinorVersionUpgrade: true,
  }));
});

test('repository honors database retention period', () => {
  // GIVEN
  const period = 20;

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
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
    instanceType: InstanceType.of(
      InstanceClass.R4,
      InstanceSize.LARGE,
    ),
    vpc,
    vpcSubnets: {
      onePerAz: true,
      subnetType: SubnetType.PRIVATE,
    },
  });

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret! }),
    version,
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
    instanceType: InstanceType.of(
      InstanceClass.R4,
      InstanceSize.LARGE,
    ),
    vpc,
    vpcSubnets: {
      onePerAz: true,
      subnetType: SubnetType.PRIVATE,
    },
    backup: {
      retention: Duration.days(15),
    },
  });

  if (!fsDatabase.secret) {
    throw new Error('secret cannot be null');
  }

  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    database: DatabaseConnection.forDocDB({ database: fsDatabase, login: fsDatabase.secret }),
    version,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::EFS::FileSystem'));
  expectCDK(stack).to(haveResource('AWS::EFS::MountTarget'));
  expect(repo.node.tryFindChild('PadEfsStorage')).toBeDefined();
  expect(repo.node.findChild('FileSystem').node.tryFindChild('PaddingAccessPoint')).toBeDefined();
});

test('default repository instance is created using user defined installation path prefix', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
    repositoryInstallationPrefix: 'xyz',
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toMatch(/\/mnt\/efs\/fs1\/xyz/);
});

test('default repository instance is created using user defined installation path prefix with extra slashes in path', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
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
    version,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: {
      ResourceSignal: {
        Count: 1,
        Timeout: 'PT30M',
      },
    },
  }, ResourcePart.CompleteDefinition));
});

test('repository instance is created with correct installer path version', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toMatch(/10\.1\.9\.2/);
});

test.each([
  'test-prefix/',
  '',
])('repository instance is created with correct LogGroup prefix %s', (testPrefix: string) => {
  // GIVEN
  const id = 'repositoryInstaller';

  // WHEN
  new Repository(stack, id, {
    vpc,
    version,
    logGroupProps: {
      logGroupPrefix: testPrefix,
    },
  });

  // THEN
  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    LogGroupName: testPrefix + id,
  }));
});

test('validate instance self-termination', () => {
  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
  });
  const asgLogicalId = stack.getLogicalId(repo.node.defaultChild!.node.defaultChild as CfnElement);

  // THEN
  const regionToken = escapeTokenRegex('${Token[AWS.Region.\\d+]}');
  const expectedString = `function exitTrap\\(\\)\\{\nexitCode=\\$\\?\nsleep 1m\nTOKEN=\\$\\(curl -X PUT "http:\\/\\/169\\.254\\.169\\.254\\/latest\\/api\\/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 30" 2> \\/dev\\/null\\)\nINSTANCE="\\$\\(curl -s -H "X-aws-ec2-metadata-token: \\$TOKEN" http:\\/\\/169\\.254\\.169\\.254\\/latest\\/meta-data\\/instance-id  2> \\/dev\\/null\\)"\nASG="\\$\\(aws --region ${regionToken} ec2 describe-tags --filters "Name=resource-id,Values=\\$\\{INSTANCE\\}" "Name=key,Values=aws:autoscaling:groupName" --query "Tags\\[0\\]\\.Value" --output text\\)"\naws --region ${regionToken} autoscaling update-auto-scaling-group --auto-scaling-group-name \\$\\{ASG\\} --min-size 0 --max-size 0 --desired-capacity 0\n\\/opt\\/aws\\/bin\\/cfn-signal --stack ${stack.stackName} --resource ${asgLogicalId} --region ${regionToken} -e \\$exitCode \\|\\| echo 'Failed to send Cloudformation Signal'\n\\}`;
  expect((repo.node.defaultChild as AutoScalingGroup).userData.render()).toMatch(new RegExp(expectedString));
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: arrayWith(
        {
          Action: 'autoscaling:UpdateAutoScalingGroup',
          Condition: {
            StringEquals: {
              'autoscaling:ResourceTag/resourceLogicalId': Names.uniqueId(repo),
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
      ),
    },
  }));
});

test('repository configure client instance', () => {
  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
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
  expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/repository false rw')));

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
    version,
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
      Statement: arrayWith(
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
      ),
    },
  }));
});

test('windows client cannot direct connect to repository', () => {
  // GIVEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
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

describe('tagging', () => {
  testConstructTags({
    constructName: 'Repository',
    createConstruct: () => {
      // GIVEN
      const isolatedStack = new Stack(app, 'IsolatedStack');
      new Repository(isolatedStack, 'Repository', {
        vpc,
        version,
      });
      return isolatedStack;
    },
    resourceTypeCounts: {
      'AWS::EC2::SecurityGroup': 3,
      'AWS::DocDB::DBClusterParameterGroup': 1,
      'AWS::DocDB::DBSubnetGroup': 1,
      'AWS::SecretsManager::Secret': 1,
      'AWS::DocDB::DBCluster': 1,
      'AWS::DocDB::DBInstance': 1,
      'AWS::IAM::Role': 1,
      'AWS::AutoScaling::AutoScalingGroup': 1,
      'AWS::SSM::Parameter': 1,
    },
  });
});

describe('Security Groups', () => {
  let repositorySecurityGroup: ISecurityGroup;

  beforeEach(() => {
    repositorySecurityGroup = new SecurityGroup(stack, 'AdditionalSecurityGroup', { vpc });
  });

  describe('DocDB', () => {

    test('adds security groups on construction', () => {
      // WHEN
      new Repository(stack, 'Repository', {
        version,
        vpc,
        securityGroupsOptions: {
          database: repositorySecurityGroup,
        },
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::DocDB::DBCluster', {
        VpcSecurityGroupIds: arrayWith(stack.resolve(repositorySecurityGroup.securityGroupId)),
      }));
    });
  });

  describe('EFS', () => {

    test('adds security groups on construction', () => {
      // WHEN
      new Repository(stack, 'Repository', {
        version,
        vpc,
        securityGroupsOptions: {
          fileSystem: repositorySecurityGroup,
        },
      });

      // THEN
      // The EFS construct adds the security group to each mount target, and one mount target is generated per subnet.
      const numMountTargets = vpc.selectSubnets().subnets.length;
      expectCDK(stack).to(countResourcesLike('AWS::EFS::MountTarget', numMountTargets, {
        SecurityGroups: arrayWith(stack.resolve(repositorySecurityGroup.securityGroupId)),
      }));
    });
  });

  describe('Installer', () => {

    test('adds security groups on construction', () => {
      // WHEN
      new Repository(stack, 'Repository', {
        version,
        vpc,
        securityGroupsOptions: {
          installer: repositorySecurityGroup,
        },
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
        SecurityGroups: arrayWith(stack.resolve(repositorySecurityGroup.securityGroupId)),
      }));
    });

  });
});

test('validates VersionQuery is not in a different stack', () => {
  // GIVEN
  const newStack = new Stack(app, 'NewStack');
  version = new VersionQuery(stack, 'Version');
  new Repository(newStack, 'Repository', {
    vpc,
    version,
  });

  // WHEN
  function synth() {
    SynthUtils.synthesize(newStack);
  }

  // THEN
  expect(synth).toThrow('A VersionQuery can not be supplied from a different stack');
});

test('creates an EFS AccessPoint when no filesystem is supplied', () => {
  // WHEN
  const repo = new Repository(stack, 'Repository', {
    version,
    vpc,
  });

  // THEN
  const efsResource = (repo.node.findChild('FileSystem') as CfnElement).node.defaultChild as CfnFileSystem;
  expectCDK(stack).to(haveResource('AWS::EFS::AccessPoint', {
    FileSystemId: stack.resolve(efsResource.ref),
    PosixUser: {
      Gid: '0',
      Uid: '0',
    },
    RootDirectory: {},
  }));
});

test('throws an error if supplied a MountableEfs with no Access Point', () => {
  // GIVEN
  const newStack = new Stack(app, 'NewStack');
  const fs = new EfsFileSystem(newStack, 'FileSystem', {
    vpc,
  });
  const mountableFs = new MountableEfs(newStack, {
    filesystem: fs,
  });

  // WHEN
  function when() {
    new Repository(newStack, 'Repo', {
      version,
      vpc,
      fileSystem: mountableFs,
    });
  }

  // THEN
  expect(when).toThrow('When using EFS with the Repository, you must provide an EFS Access Point');
});

test('imports repository settings', () => {
  // GIVEN
  const repositorySettings = new Asset(stack, 'RepositorySettingsAsset', {
    path: __filename,
  });

  // WHEN
  const repository = new Repository(stack, 'Repository', {
    vpc,
    version,
    repositorySettings,
  });

  // THEN
  const installerGroup = repository.node.tryFindChild('Installer') as AutoScalingGroup;
  expect(installerGroup.userData.render()).toContain(`aws s3 cp '${repositorySettings.s3ObjectUrl}'`);
});
