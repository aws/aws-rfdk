/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import {
  App,
  CfnElement,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  BlockDeviceVolume,
} from 'aws-cdk-lib/aws-autoscaling';
import {
  GenericLinuxImage,
  GenericWindowsImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Peer,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  AssetImage,
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';

import {
  HealthMonitor,
} from '../../core/lib';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from '../../core/test/asset-constants';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  IHost,
  InstanceUserDataProvider,
  IRenderQueue,
  RenderQueue,
  Repository,
  Version,
  VersionQuery,
  WorkerInstanceConfiguration,
  WorkerInstanceFleet,
  WorkerInstanceFleetProps,
} from '../lib';
import {
  CONFIG_WORKER_ASSET_LINUX,
  CONFIG_WORKER_ASSET_WINDOWS,
  CONFIG_WORKER_HEALTHCHECK_LINUX,
  CONFIG_WORKER_HEALTHCHECK_WINDOWS,
  CONFIG_WORKER_PORT_ASSET_LINUX,
  CONFIG_WORKER_PORT_ASSET_WINDOWS,
  RQ_CONNECTION_ASSET,
} from './asset-constants';
import { resourcePropertiesCountIs } from './test-helper';

let app: App;
let stack: Stack;
let wfstack: Stack;
let vpc: IVpc;
let renderQueue: IRenderQueue;
let rcsImage: AssetImage;

beforeEach(() => {
  app = new App();
  stack = new Stack(app, 'infraStack', {
    env: {
      region: 'us-east-1',
    },
  });
  vpc = new Vpc(stack, 'VPC');
  rcsImage = ContainerImage.fromAsset(__dirname);
  const version = new VersionQuery(stack, 'VersionQuery');
  renderQueue = new RenderQueue(stack, 'RQ', {
    vpc,
    images: { remoteConnectionServer: rcsImage },
    repository: new Repository(stack, 'Repository', {
      vpc,
      version,
      secretsManagementSettings: { enabled: false },
    }),
    trafficEncryption: { externalTLS: { enabled: false } },
    version,
  });
  wfstack = new Stack(app, 'workerFleetStack', {
    env: {
      region: 'us-east-1',
    },
  });
});

test('default worker fleet is created correctly', () => {
  // WHEN
  const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
  });

  // THEN
  Template.fromStack(wfstack).resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
  Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.large',
    IamInstanceProfile: {
      Ref: Match.stringLikeRegexp('^workerFleetInstanceProfile.*'),
    },
    ImageId: 'ami-any',
    SecurityGroups: [
      {
        'Fn::GetAtt': [
          Match.stringLikeRegexp('^workerFleetInstanceSecurityGroup.*'),
          'GroupId',
        ],
      },
    ],
    spotPrice: Match.absent(),
  });
  Template.fromStack(wfstack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    ToPort: parseInt(renderQueue.endpoint.portAsString(), 10),
    SourceSecurityGroupId: {
      'Fn::GetAtt': [
        stack.getLogicalId(fleet.fleet.connections.securityGroups[0].node.defaultChild as CfnElement),
        'GroupId',
      ],
    },
    GroupId: {
      'Fn::ImportValue': 'infraStack:ExportsOutputFnGetAttRQLBSecurityGroupAC643AEDGroupId8F9F7830',
    },
  });
  Template.fromStack(wfstack).hasResourceProperties('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: '/renderfarm/workerFleet',
  });
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.'),
  );
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without a health monitor attached to it. This means that the fleet will not automatically scale-in to 0 if the workers are unhealthy'),
  );
});

test('security group is added to fleet after its creation', () => {
  // WHEN
  const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
  });

  fleet.addSecurityGroup(SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
    allowAllOutbound: false,
  }));

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    SecurityGroups: [
      {
        'Fn::GetAtt': [
          stack.getLogicalId(fleet.fleet.connections.securityGroups[0].node.defaultChild as CfnElement),
          'GroupId',
        ],
      },
      'sg-123456789',
    ],
  });
});

test('WorkerFleet uses given security group', () => {
  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
    securityGroup: SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
      allowAllOutbound: false,
    }),
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    SecurityGroups: [
      'sg-123456789',
    ],
  });
});

describe('allowing log listener port', () => {
  test('from CIDR', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });

    fleet.allowListenerPortFrom(Peer.ipv4('127.0.0.1/24').connections);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
      SecurityGroupIngress: [
        {
          CidrIp: '127.0.0.1/24',
          Description: 'Worker remote command listening port',
          FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
          IpProtocol: 'tcp',
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    });
  });

  test('to CIDR', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });

    fleet.allowListenerPortTo(Peer.ipv4('127.0.0.1/24').connections);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
      SecurityGroupIngress: [
        {
          CidrIp: '127.0.0.1/24',
          Description: 'Worker remote command listening port',
          FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
          IpProtocol: 'tcp',
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    });
  });

  test('from SecurityGroup', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowListenerPortFrom(securityGroup);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    });
  });

  test('to SecurityGroup', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowListenerPortTo(securityGroup);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    });
  });

  test('from other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowListenerPortFrom(securityGroup);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    });
  });

  test('to other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowListenerPortTo(securityGroup);

    // THEN
    Template.fromStack(otherStack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    });
  });
});

test('default worker fleet is created correctly with linux image', () => {
  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
  });

  // THEN
  // 3 = repository + renderqueue + worker fleet
  Template.fromStack(stack).resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 3);
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.large',
    IamInstanceProfile: {
      Ref: Match.stringLikeRegexp('^workerFleetInstanceProfile.*'),
    },
    ImageId: 'ami-any',
    SecurityGroups: [
      {
        'Fn::GetAtt': [
          Match.stringLikeRegexp('^workerFleetInstanceSecurityGroup.*'),
          'GroupId',
        ],
      },
    ],
    spotPrice: Match.absent(),
  });

});

test('default worker fleet is created correctly with spot config', () => {
  // WHEN
  new WorkerInstanceFleet(wfstack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    spotPrice: 2.5,
  });

  // THEN
  Template.fromStack(wfstack).resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
  Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    SpotPrice: '2.5',
  });
});

test('default worker fleet is not created with incorrect spot config', () => {
  // WHEN
  expect(() => {
    new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      spotPrice: WorkerInstanceFleet.SPOT_PRICE_MAX_LIMIT + 1,
    });
  }).toThrowError(/Invalid value: 256 for property 'spotPrice'. Valid values can be any decimal between 0.001 and 255./);

  // WHEN
  expect(() => {
    new WorkerInstanceFleet(wfstack, 'workerFleet2', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      spotPrice: WorkerInstanceFleet.SPOT_PRICE_MIN_LIMIT / 2,
    });
  }).toThrowError(/Invalid value: 0.0005 for property 'spotPrice'. Valid values can be any decimal between 0.001 and 255./);
});

test('default worker fleet is created correctly custom Instance type', () => {
  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.medium',
  });
});

test.each([
  'test-prefix/',
  '',
])('default worker fleet is created correctly with custom LogGroup prefix %s', (testPrefix: string) => {
  // GIVEN
  const id  = 'workerFleet';

  // WHEN
  new WorkerInstanceFleet(stack, id, {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    logGroupProps: {
      logGroupPrefix: testPrefix,
    },
  });

  Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: testPrefix + id,
  });
});

test('default linux worker fleet is created correctly custom subnet values', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
    vpcSubnets: {
      subnetType: SubnetType.PUBLIC,
    },
    healthCheckConfig: {
      port: 6161,
    },
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: [{
      Ref: 'VPC1AzPublicSubnet1Subnet9649CC17',
    }],
  });
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.medium',
    IamInstanceProfile: {
      Ref: Match.stringLikeRegexp('workerFleetInstanceProfile.*'),
    },
    UserData: {
      'Fn::Base64': {
        'Fn::Join': [
          '',
          [
            '#!/bin/bash\n' +
            'function exitTrap(){\nexitCode=$?\n/opt/aws/bin/cfn-signal --stack infraStack --resource workerFleetASG25520D69 --region us-east-1 -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n}\n' +
            'trap exitTrap EXIT\n' +
            `mkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CWA_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n` +
            `set -e\nchmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh' -i us-east-1 `,
            {
              Ref: Match.stringLikeRegexp('^workerFleetStringParameter.*'),
            },
            `\nmkdir -p $(dirname '/tmp/${RQ_CONNECTION_ASSET.Key}.py')\naws s3 cp 's3://`,
            {
              'Fn::Sub': RQ_CONNECTION_ASSET.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${RQ_CONNECTION_ASSET.Key}.py' '/tmp/${RQ_CONNECTION_ASSET.Key}.py'\n` +
            'if [ -f "/etc/profile.d/deadlineclient.sh" ]; then\n  source "/etc/profile.d/deadlineclient.sh"\nfi\n' +
            `"\${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "http://`,
            {
              'Fn::GetAtt': [
                'RQLB3B7B1CBC',
                'DNSName',
              ],
            },
            `:8080" \nrm -f "/tmp/${RQ_CONNECTION_ASSET.Key}.py"` +
            `\nmkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
            `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
            'set -e\n' +
            `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
            `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
          ],
        ],
      },
    },
  });
});

test('default windows worker fleet is created correctly custom subnet values', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': '123',
    }),
    renderQueue,
    instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
    vpcSubnets: {
      subnetType: SubnetType.PUBLIC,
    },
    healthCheckConfig: {
      port: 6161,
    },
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: [{
      Ref: 'VPC1AzPublicSubnet1Subnet9649CC17',
    }],
  });
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.medium',
    IamInstanceProfile: {
      Ref: Match.stringLikeRegexp('workerFleetInstanceProfile.*'),
    },
    UserData: {
      'Fn::Base64': {
        'Fn::Join': [
          '',
          [
            '<powershell>trap {\n$success=($PSItem.Exception.Message -eq "Success")\n' +
            'cfn-signal --stack infraStack --resource workerFleetASG25520D69 --region us-east-1 --success ($success.ToString().ToLower())\nbreak\n}\n' +
            `mkdir (Split-Path -Path 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
            {
              'Fn::Sub': CWA_ASSET_WINDOWS.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `' -key '${CWA_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n&'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -i us-east-1 `,
            {
              Ref: Match.stringLikeRegexp('^workerFleetStringParameter.*'),
            },
            `\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }\n` +
            `mkdir (Split-Path -Path 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
            {
              'Fn::Sub': RQ_CONNECTION_ASSET.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `' -key '${RQ_CONNECTION_ASSET.Key}.py' -file 'C:/temp/${RQ_CONNECTION_ASSET.Key}.py' -ErrorAction Stop\n` +
            '$ErrorActionPreference = "Stop"\n' +
            '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value\n' +
            `& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "C:/temp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "http://`,
            {
              'Fn::GetAtt': [
                'RQLB3B7B1CBC',
                'DNSName',
              ],
            },
            ':8080"  2>&1\n' +
            `Remove-Item -Path "C:/temp/${RQ_CONNECTION_ASSET.Key}.py"\n` +
            `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
            {
              'Fn::Sub': CONFIG_WORKER_ASSET_WINDOWS.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `' -key '${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -file 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -ErrorAction Stop\n` +
            `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
            {
              'Fn::Sub': CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `' -key '${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
            `&'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py\n` +
            `if (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }\n` +
            'throw \"Success\"</powershell>',
          ],
        ],
      },
    },
  });
});

test('default worker fleet is created correctly with groups, pools and region', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
    vpcSubnets: {
      subnetType: SubnetType.PUBLIC,
    },
    groups: ['A', 'B'], // We want to make sure that these are converted to lowercase
    pools: ['C', 'D'], // We want to make sure that these are converted to lowercase
    region: 'E',
  });

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.medium',
    IamInstanceProfile: {
      Ref: Match.stringLikeRegexp('workerFleetInstanceProfile.*'),
    },
    UserData: {
      'Fn::Base64': {
        'Fn::Join': [
          '',
          [
            '#!/bin/bash\n' +
            'function exitTrap(){\nexitCode=$?\n/opt/aws/bin/cfn-signal --stack infraStack --resource workerFleetASG25520D69 --region us-east-1 -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n}\n' +
            'trap exitTrap EXIT\n' +
            `mkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CWA_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n` +
            `set -e\nchmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh' -i us-east-1 `,
            {
              Ref: Match.stringLikeRegexp('^workerFleetStringParameter.*'),
            },
            `\nmkdir -p $(dirname '/tmp/${RQ_CONNECTION_ASSET.Key}.py')\naws s3 cp 's3://`,
            {
              'Fn::Sub': RQ_CONNECTION_ASSET.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${RQ_CONNECTION_ASSET.Key}.py' '/tmp/${RQ_CONNECTION_ASSET.Key}.py'\n` +
            'if [ -f "/etc/profile.d/deadlineclient.sh" ]; then\n  source "/etc/profile.d/deadlineclient.sh"\nfi\n' +
            `"\${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/${RQ_CONNECTION_ASSET.Key}.py" --render-queue "http://`,
            {
              'Fn::GetAtt': [
                'RQLB3B7B1CBC',
                'DNSName',
              ],
            },
            `:8080" \nrm -f "/tmp/${RQ_CONNECTION_ASSET.Key}.py"` +
            `\nmkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
            `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
            {
              'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket.replace('${AWS::Region}', 'us-east-1'),
            },
            `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
            'set -e\n' +
            `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
            `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' 'a,b' 'c,d' 'E' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
          ],
        ],
      },
    },
  });
});

test('worker fleet does validation correctly with groups, pools and region', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // group name as 'none'
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      groups: ['A', 'none'],
    });
  }).toThrowError();

  // group name with whitespace
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet1', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      groups: ['A', 'no ne'],
    });
  }).toThrowError(/Invalid value: no ne for property 'groups'/);

  // pool name with whitespace
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet2', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      pools: ['A', 'none'],
    });
  }).toThrowError(/Invalid value: none for property 'pools'/);

  // pool name as 'none'
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet3', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      pools: ['A', 'none'],
    });
  }).toThrowError(/Invalid value: none for property 'pools'/);

  // region as 'none'
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet4', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'none',
    });
  }).toThrowError(/Invalid value: none for property 'region'/);

  // region as 'all'
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet5', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'all',
    });
  }).toThrowError(/Invalid value: all for property 'region'/);

  // region as 'unrecognized'
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet6', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'unrecognized',
    });
  }).toThrowError(/Invalid value: unrecognized for property 'region'/);

  // region with invalid characters
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet7', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'none@123',
    });
  }).toThrowError(/Invalid value: none@123 for property 'region'/);

  // region with reserved name as substring
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet8', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'none123',
    });
  }).not.toThrowError();

  // region with case-insensitive name
  expect(() => {
    new WorkerInstanceFleet(stack, 'workerFleet9', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': '123',
      }),
      renderQueue,
      region: 'None',
    });
  }).toThrowError(/Invalid value: None for property 'region'/);
});
describe('Block Device Tests', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    // create a health monitor so it does not trigger warnings
    healthMonitor = new HealthMonitor(wfstack,'healthMonitor', {
      vpc,
    });
  });

  test('Warning if no BlockDevices provided', () => {
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
    });
    Annotations.fromStack(wfstack).hasWarning(
      `/${fleet.node.path}`,
      Match.stringLikeRegexp('.*being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.'),
    );
  });

  test('No Warnings if Encrypted BlockDevices Provided', () => {
    const VOLUME_SIZE = 50;

    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      blockDevices: [ {
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE, {encrypted: true}),
      }],
    });

    //THEN
    Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            Encrypted: true,
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    });

    Annotations.fromStack(wfstack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
  });

  test('Warnings if non-Encrypted BlockDevices Provided', () => {
    const VOLUME_SIZE = 50;
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE, {encrypted: false}),
      }],
    });

    //THEN
    Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            Encrypted: false,
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    });

    Annotations.fromStack(wfstack).hasWarning(
      `/${fleet.node.path}`,
      Match.stringLikeRegexp(`The BlockDevice \"${DEVICE_NAME}\" on the worker-fleet workerFleet is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`),
    );
  });

  test('Warnings for BlockDevices without encryption specified', () => {
    const VOLUME_SIZE = 50;
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE ),
      }],
    });

    //THEN
    Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    });

    Annotations.fromStack(wfstack).hasWarning(
      `/${fleet.node.path}`,
      Match.stringLikeRegexp(`The BlockDevice \"${DEVICE_NAME}\" on the worker-fleet workerFleet is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`),
    );
  });

  test('No warnings for Ephemeral blockDeviceVolumes', () => {
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ephemeral( 0 ),
      }],
    });

    //THEN
    Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          DeviceName: DEVICE_NAME,
          VirtualName: 'ephemeral0',
        },
      ],
    });

    Annotations.fromStack(wfstack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
  });

  test('No warnings for Suppressed blockDeviceVolumes', () => {
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.noDevice(  ),
      }],
    });

    //THEN
    Template.fromStack(wfstack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          DeviceName: DEVICE_NAME,
        },
      ],
    });

    Annotations.fromStack(wfstack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
    Annotations.fromStack(wfstack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
  });
});

describe('HealthMonitor Tests', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    // create a health monitor so it does not trigger warnings
    healthMonitor = new HealthMonitor(wfstack,'healthMonitor', {
      vpc,
    });
  });

  test('Monitor is configured for Windows', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
    });
    const userData = fleet.fleet.userData.render();

    // THEN
    // Ensure the configuration script is executed with the expected arguments.
    expect(userData).toContain(`&'C:/temp/${CONFIG_WORKER_HEALTHCHECK_WINDOWS.Key}.ps1' '63415' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}'`);
    // Ensure that the health monitor target group has been set up.
    //  Note: It's sufficient to just check for any resource created by the HealthMonitor registration.
    //   The HealthMonitor tests cover ensuring that all of the resources are set up.
    Template.fromStack(wfstack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckIntervalSeconds: 300,
      HealthCheckPort: '63415',
      HealthCheckProtocol: 'HTTP',
      Port: 8081,
      Protocol: 'HTTP',
      TargetType: 'instance',
    });
  });

  test('Monitor is configured for Linux', () => {
    // WHEN
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
    });
    const userData = fleet.fleet.userData.render();

    // THEN
    // Ensure the configuration script is executed with the expected arguments.
    expect(userData).toContain(`'/tmp/${CONFIG_WORKER_HEALTHCHECK_LINUX.Key}.sh' '63415' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}'`);
    // Ensure that the health monitor target group has been set up.
    //  Note: It's sufficient to just check for any resource created by the HealthMonitor registration.
    //   The HealthMonitor tests cover ensuring that all of the resources are set up.
    Template.fromStack(wfstack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckIntervalSeconds: 300,
      HealthCheckPort: '63415',
      HealthCheckProtocol: 'HTTP',
      Port: 8081,
      Protocol: 'HTTP',
      TargetType: 'instance',
    });
  });

  test('UserData is added', () => {
    // WHEN
    class UserDataProvider extends InstanceUserDataProvider {
      preCloudWatchAgent(host: IHost): void {
        host.userData.addCommands('echo preCloudWatchAgent');
      }
      preRenderQueueConfiguration(host: IHost): void {
        host.userData.addCommands('echo preRenderQueueConfiguration');
      }
      preWorkerConfiguration(host: IHost): void {
        host.userData.addCommands('echo preWorkerConfiguration');
      }
      postWorkerLaunch(host: IHost): void {
        host.userData.addCommands('echo postWorkerLaunch');
      }
    }
    const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
      vpc,
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      renderQueue,
      healthMonitor,
      userDataProvider: new UserDataProvider(wfstack, 'UserDataProvider'),
    });
    const userData = fleet.fleet.userData.render();

    // THEN
    expect(userData).toContain('echo preCloudWatchAgent');
    expect(userData).toContain('echo preRenderQueueConfiguration');
    expect(userData).toContain('echo preWorkerConfiguration');
    expect(userData).toContain('echo postWorkerLaunch');
  });
});

describe('tagging', () => {
  testConstructTags({
    constructName: 'WorkerInstanceFleet',
    createConstruct: () => {
      // GIVEN
      const healthMonitorStack = new Stack(app, 'HealthMonitorStack', {
        env: {
          region: 'us-east-1',
        },
      });
      const healthMonitor = new HealthMonitor(healthMonitorStack,'healthMonitor', {
        vpc,
      });
      const deviceName = '/dev/xvda';

      // WHEN
      new WorkerInstanceFleet(wfstack, 'WorkerFleet', {
        vpc,
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        renderQueue,
        healthMonitor,
        blockDevices: [{
          deviceName,
          volume: BlockDeviceVolume.noDevice(),
        }],
      });

      return wfstack;
    },
    resourceTypeCounts: {
      'AWS::EC2::SecurityGroup': 1,
      'AWS::IAM::Role': 1,
      'AWS::AutoScaling::AutoScalingGroup': 1,
      'AWS::ElasticLoadBalancingV2::TargetGroup': 1,
      'AWS::SSM::Parameter': 1,
    },
  });
});

test('worker fleet signals when non-zero minCapacity', () => {
  // WHEN
  const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
    minCapacity: 1,
  });

  // WHEN
  const userData = fleet.fleet.userData.render();

  // THEN
  expect(userData).toContain('cfn-signal');
  Template.fromStack(wfstack).hasResource('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: {
      ResourceSignal: {
        Count: 1,
      },
    },
  });
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.'),
  );
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without a health monitor attached to it. This means that the fleet will not automatically scale-in to 0 if the workers are unhealthy'),
  );

});

test('worker fleet does not signal when zero minCapacity', () => {
  // WHEN
  const fleet = new WorkerInstanceFleet(wfstack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
    minCapacity: 0,
  });

  // WHEN
  const userData = fleet.fleet.userData.render();

  // THEN
  // There should be no cfn-signal call in the UserData.
  expect(userData).not.toContain('cfn-signal');
  // Make sure we don't have a CreationPolicy
  resourcePropertiesCountIs(wfstack, 'AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: Match.anyValue(),
  }, 0);
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*Deploying with 0 minimum capacity\..*'),
  );
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.'),
  );
  Annotations.fromStack(wfstack).hasWarning(
    `/${fleet.node.path}`,
    Match.stringLikeRegexp('.*being created without a health monitor attached to it. This means that the fleet will not automatically scale-in to 0 if the workers are unhealthy'),
  );
});

describe('secrets management enabled', () => {
  let props: WorkerInstanceFleetProps;

  // GIVEN
  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'Stack');
    vpc = new Vpc(stack, 'VPC');
    rcsImage = ContainerImage.fromAsset(__dirname);
    const version = new VersionQuery(stack, 'VersionQuery');
    renderQueue = new RenderQueue(stack, 'RQ', {
      vpc,
      images: { remoteConnectionServer: rcsImage },
      repository: new Repository(stack, 'Repository', {
        vpc,
        version,
      }),
      version,
    });
    wfstack = new Stack(app, 'workerFleetStack');
    props = {
      renderQueue,
      vpc,
      workerMachineImage: new GenericWindowsImage({}),
    };
  });

  test('vpc subnets not specified => warns about dedicated subnets', () => {
    // WHEN
    const workerInstanceFleet = new WorkerInstanceFleet(wfstack, 'WorkerInstanceFleet', props);

    // THEN
    Annotations.fromStack(wfstack).hasWarning(
      `/${workerInstanceFleet.node.path}`,
      'Deadline Secrets Management is enabled on the Repository and VPC subnets have not been supplied. Using dedicated subnets is recommended. See https://github.com/aws/aws-rfdk/blobs/release/packages/aws-rfdk/lib/deadline/README.md#using-dedicated-subnets-for-deadline-components',
    );
  });

  test('vpc subnets specified => does not emit dedicated subnets warning', () => {
    // WHEN
    const workerInstanceFleet = new WorkerInstanceFleet(wfstack, 'WorkerInstanceFleet', {
      ...props,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
    });

    // THEN
    Annotations.fromStack(wfstack).hasNoWarning(
      `/${workerInstanceFleet.node.path}`,
      Match.stringLikeRegexp('.*dedicated subnet.*'),
    );
  });
});
