/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CfnElement,
  Duration,
  Names,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {AutoScalingGroup} from 'aws-cdk-lib/aws-autoscaling';
import {DatabaseCluster} from 'aws-cdk-lib/aws-docdb';
import {
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
} from 'aws-cdk-lib/aws-ec2';
import {
  AccessPoint,
  CfnFileSystem,
  FileSystem as EfsFileSystem,
} from 'aws-cdk-lib/aws-efs';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

import {
  MountableEfs,
} from '../../core';
import {
  CWA_ASSET_LINUX,
} from '../../core/test/asset-constants';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  DatabaseConnection,
  IVersion,
  Repository,
  VersionQuery,
  Version,
  PlatformInstallers,
} from '../lib';
import {
  CONFIG_REPO_DIRECT_CONNECT_LINUX,
  REPO_DC_ASSET,
} from './asset-constants';
import {
  resourcePropertiesCountIs,
} from './test-helper';

let app: App;
let stack: Stack;
let vpc: IVpc;
let version: IVersion;
let installers: PlatformInstallers;

function escapeTokenRegex(s: string): string {
  // A CDK Token looks like: ${Token[TOKEN.12]}
  // This contains the regex special characters: ., $, {, }, [, and ]
  // Escape those for use in a regex.
  return s.replace(/[.${}[\]]/g, '\\$&');
}

function create_version(version_array: number[]): IVersion {
  class MockVersion extends Version implements IVersion {
    readonly linuxInstallers: PlatformInstallers = installers;

    public linuxFullVersionString() {
      return this.toString();
    }
  }

  return new MockVersion(version_array);
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
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      {
        name: 'Isolated',
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    ],
  });
  installers = {
    patchVersion: 0,
    repository: {
      objectKey: 'testInstaller',
      s3Bucket: new Bucket(stack, 'LinuxInstallerBucket'),
    },
    client: {
      objectKey: 'testClientInstaller',
      s3Bucket: new Bucket(stack, 'LinuxClientInstallerBucket'),
    },
  };
  version = create_version([10,1,19,4]);
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
  Template.fromStack(stack).hasResource('AWS::AutoScaling::AutoScalingGroup', {
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
    DependsOn: Match.arrayWith([
      'repositoryInstallerDocumentDatabaseInstance11A6F8C8E',
    ]),
  });
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't3.large',
  });

  Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
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
  });
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
    vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: isolatedSubnetIds,
  });
});

test('repository installer security groups created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
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
  });
  Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
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
  });
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
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([{
        Action: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        Effect: 'Allow',
        Resource: {
          Ref: 'repositoryInstallerDocumentDatabaseSecretAttachment29753B7C',
        },
      }]),
    },
    PolicyName: Match.stringLikeRegexp('^repositoryInstallerInstanceRoleDefaultPolicy.*'),
  });
});

test('repository installer iam permissions: installer get', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        {
          Action: [
            's3:GetObject*',
            's3:GetBucket*',
            's3:List*',
          ],
          Effect: 'Allow',
          Resource: Match.arrayWith([
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
          ]),
        },
      ]),
    },
    PolicyName: Match.stringLikeRegexp('^repositoryInstallerInstanceRoleDefaultPolicy.*'),
  });
});

test('default repository installer log group created correctly', () => {
  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version,
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: '/renderfarm/repositoryInstaller',
  });
});

test.each([
  [[10,1,19,4]],
  [[10,2,0,9]],
])('repository installer logs all required files', (version_array: number[]) => {
  // GIVEN
  const repository_version = create_version(version_array);

  // WHEN
  new Repository(stack, 'repositoryInstaller', {
    vpc,
    version: repository_version,
  });

  // THEN
  // The CloudWatchAgent stores the agent configuration in an SSM Parameter. Check it for the required setup.
  // Note: This would be better implemented using the tools in: https://github.com/aws/aws-cdk/pull/8444
  // but that is not yet available.
  Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
    Type: 'String',
    Value: {
      'Fn::Join': [
        '',
        [
          '{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"log_group_name\":\"',
          {}, // log group name. checked in another test.
          '\",\"log_stream_name\":\"cloud-init-output-{instance_id}\",\"file_path\":\"/var/log/cloud-init-output.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
          {}, // log group name again.
          '\",\"log_stream_name\":\"deadlineRepositoryInstallationLogs-{instance_id}\",\"file_path\":\"/tmp/'+
          (repository_version.isLessThan(Version.MINIMUM_VERSION_USING_NEW_INSTALLBUILDER_LOG) ? 'bitrock' : 'installbuilder') +
          '_installer.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
        ],
      ],
    },
  });
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
  Template.fromStack(stack).hasResource('AWS::DocDB::DBCluster', {
    DeletionPolicy: expected,
  });
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
  Template.fromStack(stack).hasResource('AWS::EFS::FileSystem', {
    DeletionPolicy: expected,
  });
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
  Annotations.fromStack(stack).hasWarning(
    `/${repo.node.path}`,
    'RemovalPolicy for filesystem will not be applied since a filesystem is not being created by this construct',
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
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
  Annotations.fromStack(stack).hasWarning(
    `/${repo.node.path}`,
    Match.stringLikeRegexp('RemovalPolicy for database will not be applied since a database is not being created by this construct.*'),
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
  Template.fromStack(stack).resourceCountIs('AWS::DocDB::DBCluster', 1);
  Template.fromStack(stack).resourceCountIs('AWS::DocDB::DBInstance', 1);
  Template.fromStack(stack).hasResourceProperties('AWS::DocDB::DBCluster', {
    EnableCloudwatchLogsExports: [ 'audit' ],
  });
  Template.fromStack(stack).hasResourceProperties('AWS::DocDB::DBClusterParameterGroup', {
    Parameters: {
      audit_logs: 'enabled',
    },
  });
  Template.fromStack(stack).hasResourceProperties('AWS::DocDB::DBInstance', {
    AutoMinorVersionUpgrade: true,
  });
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
  Template.fromStack(stack).resourceCountIs('AWS::DocDB::DBCluster', 1);
  resourcePropertiesCountIs(stack, 'AWS::DocDB::DBCluster', {
    EnableCloudwatchLogsExports: Match.arrayWith([ 'audit' ]),
  }, 0);
  resourcePropertiesCountIs(stack, 'AWS::DocDB::DBClusterParameterGroup', {
    Parameters: {
      audit_logs: 'enabled',
    },
  }, 0);
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
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
  Annotations.fromStack(stack).hasWarning(`/${repo.node.path}`, warningMsg);
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
  Template.fromStack(isolatedStack).hasResourceProperties('AWS::DocDB::DBSubnetGroup', {
    SubnetIds: [
      'SubnetID1',
      'SubnetID2',
    ],
  });
  Template.fromStack(isolatedStack).hasResourceProperties('AWS::EFS::MountTarget', { SubnetId: 'SubnetID1' });
  Template.fromStack(isolatedStack).hasResourceProperties('AWS::EFS::MountTarget', { SubnetId: 'SubnetID2' });
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
  resourcePropertiesCountIs(stack, 'AWS::DocDB::DBInstance', {
    AutoMinorVersionUpgrade: true,
  }, instanceCount);
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
  Template.fromStack(stack).hasResourceProperties('AWS::DocDB::DBCluster', {
    BackupRetentionPeriod: period,
  });
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
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
  Annotations.fromStack(stack).hasWarning(
    `/${repo.node.path}`,
    'Backup retention for database will not be applied since a database is not being created by this construct',
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
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
  Template.fromStack(stack).resourceCountIs('AWS::EFS::FileSystem', 1);
  Template.fromStack(stack).resourceCountIs('AWS::EFS::MountTarget', 2);
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
  Template.fromStack(stack).hasResource('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: {
      ResourceSignal: {
        Count: 1,
        Timeout: 'PT30M',
      },
    },
  });
});

test('repository instance is created with correct installer path version', () => {
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
  });

  // THEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData;
  expect(script.render()).toEqual(expect.stringContaining(version.versionString));
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
  Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
    LogGroupName: testPrefix + id,
  });
});

test('validate instance self-termination', () => {
  // WHEN
  const repo = new Repository(stack, 'repositoryInstaller', {
    vpc,
    repositoryInstallationTimeout: Duration.minutes(30),
    version,
  });

  // THEN
  const regionToken = escapeTokenRegex('${Token[AWS.Region.\\d+]}');
  const asgLogicalIdToken = escapeTokenRegex('${Token[Stack.repositoryInstaller.Installer.ASG.LogicalID.\\d+]}');
  const expectedString = `function exitTrap\\(\\)\\{\nexitCode=\\$\\?\nsleep 1m\nTOKEN=\\$\\(curl -X PUT "http:\\/\\/169\\.254\\.169\\.254\\/latest\\/api\\/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 30" 2> \\/dev\\/null\\)\nINSTANCE="\\$\\(curl -s -H "X-aws-ec2-metadata-token: \\$TOKEN" http:\\/\\/169\\.254\\.169\\.254\\/latest\\/meta-data\\/instance-id  2> \\/dev\\/null\\)"\nASG="\\$\\(aws --region ${regionToken} ec2 describe-tags --filters "Name=resource-id,Values=\\$\\{INSTANCE\\}" "Name=key,Values=aws:autoscaling:groupName" --query "Tags\\[0\\]\\.Value" --output text\\)"\naws --region ${regionToken} autoscaling update-auto-scaling-group --auto-scaling-group-name \\$\\{ASG\\} --min-size 0 --max-size 0 --desired-capacity 0\n\\/opt\\/aws\\/bin\\/cfn-signal --stack ${stack.stackName} --resource ${asgLogicalIdToken} --region ${regionToken} -e \\$exitCode \\|\\| echo 'Failed to send Cloudformation Signal'\n\\}`;
  expect((repo.node.defaultChild as AutoScalingGroup).userData.render()).toMatch(new RegExp(expectedString));
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
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
      ]),
    },
  });
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
    machineImage: MachineImage.latestAmazonLinux2(),
  });
  const instanceRole = (
    instance
      .node.findChild('InstanceRole')
      .node.defaultChild
  ) as CfnRole;
  const db = (
    repo
      .node.findChild('DocumentDatabase')
  ) as DatabaseCluster;

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
  expect(userData).toContain(`'/tmp/${CONFIG_REPO_DIRECT_CONNECT_LINUX.Key}.sh' "/mnt/repository/DeadlineRepository"`);

  // Assert the IAM instance profile is given read access to the database credentials secret
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([{
        Action: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        Effect: 'Allow',
        Resource: stack.resolve(db.secret!.secretArn),
      }]),
    },
    Roles: [
      stack.resolve(instanceRole.ref),
    ],
  });
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
    machineImage: MachineImage.latestAmazonLinux2(),
  });
  const instance2 = new Instance(stack, 'Instance2', {
    vpc,
    instanceType: new InstanceType('t3.small'),
    machineImage: MachineImage.latestAmazonLinux2(),
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
  resourcePropertiesCountIs(stack, 'AWS::IAM::Policy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
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
                    'Fn::Sub': REPO_DC_ASSET.Bucket,
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
                    'Fn::Sub': REPO_DC_ASSET.Bucket,
                  },
                  '/*',
                ],
              ],
            },
          ],
        },
      ]),
    }),
    PolicyName: Match.stringLikeRegexp('Instance[1-2]InstanceRoleDefaultPolicy.*'),
  }, 2);
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
  }).toThrow('Deadline direct connect on Windows hosts is not yet supported by the RFDK.');
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
      'AWS::SecretsManager::Secret': 2,
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
      Template.fromStack(stack).hasResourceProperties('AWS::DocDB::DBCluster', {
        VpcSecurityGroupIds: Match.arrayWith([stack.resolve(repositorySecurityGroup.securityGroupId)]),
      });
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
      resourcePropertiesCountIs(stack, 'AWS::EFS::MountTarget', {
        SecurityGroups: Match.arrayWith([stack.resolve(repositorySecurityGroup.securityGroupId)]),
      }, numMountTargets);
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
      Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
        SecurityGroups: Match.arrayWith([stack.resolve(repositorySecurityGroup.securityGroupId)]),
      });
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
    app.synth();
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
  Template.fromStack(stack).hasResourceProperties('AWS::EFS::AccessPoint', {
    FileSystemId: stack.resolve(efsResource.ref),
    PosixUser: {
      Gid: '0',
      Uid: '0',
    },
    RootDirectory: {},
  });
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

test('disable Secrets Management by default when Deadline version is old', () => {
  // GIVEN
  const newStack = new Stack(app, 'NewStack');
  const oldVersion = new VersionQuery(newStack, 'OldDeadlineVersion', { version: '10.0.0.0' });

  // WHEN
  const repository = new Repository(newStack, 'Repo', {
    vpc,
    version: oldVersion,
  });

  // THEN
  expect(repository.secretsManagementSettings.enabled).toBeFalsy();
  expect(repository.secretsManagementSettings.credentials).toBeUndefined();
});

test('throws when Secrets Management is enabled but deadline version is too low', () => {
  // GIVEN
  const newStack = new Stack(app, 'NewStack');
  const oldVersion = new VersionQuery(newStack, 'OldDeadlineVersion', { version: '10.0.0.0' });

  // WHEN
  function when() {
    new Repository(newStack, 'Repo', {
      version: oldVersion,
      vpc,
      secretsManagementSettings: {
        enabled: true,
      },
    });
  }

  // THEN
  expect(when).toThrow(`The supplied Deadline version (${oldVersion.versionString}) does not support Deadline Secrets Management in RFDK. Either upgrade Deadline to the minimum required version (${Version.MINIMUM_SECRETS_MANAGEMENT_VERSION.versionString}) or disable the feature in the Repository's construct properties.`);
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
  // Note: The repostory settings is the js file that this compiles in to. The hash for that is fragile in that any
  // change to this file will change it. So, we search for an s3 cp of a js file (this is the only one).
  expect(installerGroup.userData.render()).toMatch(new RegExp('aws s3 cp \'s3://[^\']+/[a-f0-9]+.js\''));
});

test('IMountableLinuxFilesystem.usesUserPosixPermissions() = true changes ownership of repository files', () => {
  // GIVEN
  const repo = new Repository(stack, 'Repository', {
    version,
    vpc,
    fileSystem: {
      mountToLinuxInstance: (_target, _mount) => {},
      usesUserPosixPermissions: () => true,
    },
  });

  // WHEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData.render();

  // THEN
  expect(script).toMatch('-o 1000:1000');
});

test('IMountableLinuxFilesystem.usesUserPosixPermissions() = false does not change ownership of repository files', () => {
  // GIVEN
  const repo = new Repository(stack, 'Repository', {
    version,
    vpc,
    fileSystem: {
      mountToLinuxInstance: (_target, _mount) => {},
      usesUserPosixPermissions: () => false,
    },
  });

  // WHEN
  const script = (repo.node.defaultChild as AutoScalingGroup).userData.render();

  // THEN
  expect(script).not.toMatch('-o 1000:1000');
});

test('secret manager enabled', () => {
  // GIVEN
  const expectedCredentials = new Secret(stack, 'CustomSMAdminUser', {
    description: 'Custom admin credentials for the Secret Management',
    generateSecretString: {
      excludeCharacters: '\"$&\'()-/<>[\\]\`{|}',
      includeSpace: false,
      passwordLength: 24,
      requireEachIncludedType: true,
      generateStringKey: 'password',
      secretStringTemplate: JSON.stringify({ username: 'admin' }),
    },
  });

  // WHEN
  const repository = new Repository(stack, 'Repository', {
    vpc,
    version,
    secretsManagementSettings: {
      enabled: true,
      credentials: expectedCredentials,
    },
  });

  // THEN
  expect(repository.secretsManagementSettings.credentials).toBe(expectedCredentials);
  const installerGroup = repository.node.tryFindChild('Installer') as AutoScalingGroup;
  expect(installerGroup.userData.render()).toContain(`-r ${stack.region} -c ${expectedCredentials.secretArn}`);
});

test('secret manager is enabled by default', () => {
  // WHEN
  const repository = new Repository(stack, 'Repository', {
    vpc,
    version,
  });

  // THEN
  expect(repository.secretsManagementSettings.enabled).toBeTruthy();
  expect(repository.secretsManagementSettings.credentials).toBeDefined();
});

test('credentials are undefined when secrets management is disabled', () => {
  // WHEN
  const repository = new Repository(stack, 'Repository', {
    vpc,
    version,
    secretsManagementSettings: {
      enabled: false,
    },
  });

  // THEN
  expect(repository.secretsManagementSettings.credentials).toBeUndefined();
});


test('throws an error if credentials are undefined and database is imported', () => {
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
  const databaseConnection = DatabaseConnection.forDocDB({database, login: secret});

  // WHEN
  function when() {
    new Repository(stack, 'Repository', {
      vpc,
      version,
      database: databaseConnection,
    });
  }

  // THEN
  expect(when).toThrow('Admin credentials for Deadline Secrets Management cannot be generated when using an imported database. For setting up your own credentials, please refer to https://github.com/aws/aws-rfdk/tree/mainline/packages/aws-rfdk/lib/deadline#configuring-deadline-secrets-management-on-the-repository.');
});
