/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import {
  ABSENT,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  objectLike,
  ResourcePart,
} from '@aws-cdk/assert';
import {
  BlockDeviceVolume,
} from '@aws-cdk/aws-autoscaling';
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
} from '@aws-cdk/aws-ec2';
import {
  AssetImage,
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import { ArtifactMetadataEntryType } from '@aws-cdk/cloud-assembly-schema';
import {
  App,
  CfnElement,
  Stack,
} from '@aws-cdk/core';

import {
  HealthMonitor,
} from '../../core/lib';
import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  escapeTokenRegex,
} from '../../core/test/token-regex-helpers';
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
} from '../lib';
import {
  CONFIG_WORKER_ASSET_LINUX,
  CONFIG_WORKER_ASSET_WINDOWS,
  CWA_ASSET_LINUX,
  RQ_CONNECTION_ASSET,
} from './asset-constants';

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
    }),
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
  expectCDK(wfstack).to(haveResource('AWS::AutoScaling::AutoScalingGroup'));
  expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.large',
    spotPrice: ABSENT,
  }));
  expectCDK(wfstack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
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
  }));
  expectCDK(wfstack).to(haveResource('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: '/renderfarm/workerFleet',
  }));
  expect(fleet.node.metadataEntry[0].type).toMatch(ArtifactMetadataEntryType.WARN);
  expect(fleet.node.metadataEntry[0].data).toMatch('being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');
  expect(fleet.node.metadataEntry[1].type).toMatch(ArtifactMetadataEntryType.WARN);
  expect(fleet.node.metadataEntry[1].data).toContain('being created without a health monitor attached to it. This means that the fleet will not automatically scale-in to 0 if the workers are unhealthy');
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
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    SecurityGroups: [
      {
        'Fn::GetAtt': [
          stack.getLogicalId(fleet.fleet.connections.securityGroups[0].node.defaultChild as CfnElement),
          'GroupId',
        ],
      },
      'sg-123456789',
    ],
  }));
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
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    SecurityGroups: [
      'sg-123456789',
    ],
  }));
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
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
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
    }));
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
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
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
    }));
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
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    }));
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
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    }));
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
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    }));
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
    expectCDK(otherStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + WorkerInstanceFleet['MAX_WORKERS_PER_HOST'],
    }));
  });
});

test('default worker fleet is created correctly with linux image', () => {
  // WHEN
  new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::AutoScaling::AutoScalingGroup'));
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration'));
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
  expectCDK(wfstack).to(haveResource('AWS::AutoScaling::AutoScalingGroup'));
  expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    SpotPrice: '2.5',
  }));
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
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
    InstanceType: 't2.medium',
  }));
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

  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: testPrefix + id,
  }));
});

test('default worker fleet is created correctly custom subnet values', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // WHEN
  const workers = new WorkerInstanceFleet(stack, 'workerFleet', {
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
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: [{
      Ref: 'VPC1AzPublicSubnet1Subnet9649CC17',
    }],
  }));
  const userData = stack.resolve(workers.fleet.userData.render());
  expect(userData).toStrictEqual({
    'Fn::Join': [
      '',
      [
        '#!/bin/bash\nfunction exitTrap(){\nexitCode=$?\n/opt/aws/bin/cfn-signal --stack infraStack --resource workerFleetASG25520D69 --region us-east-1 -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n}\ntrap exitTrap EXIT\nmkdir -p $(dirname \'/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "\')\naws s3 cp 's3://",
        { Ref: CWA_ASSET_LINUX.Bucket },
        '/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "' '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        '\'\n' +
        'set -e\n' +
        'chmod +x \'/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        '\'\n\'/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CWA_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        '\' -i us-east-1 ',
        {Ref: 'workerFleetStringParameterDB3717DA'},
        '\nmkdir -p $(dirname \'/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        '\')\naws s3 cp \'s3://',
        { Ref: RQ_CONNECTION_ASSET.Bucket },
        '/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        "' '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        '\'\n' +
        'if [ -f \"/etc/profile.d/deadlineclient.sh\" ]; then\n' +
        '  source \"/etc/profile.d/deadlineclient.sh\"\n' +
        'fi\n' +
        '"${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        '" --render-queue "http://',
        {
          'Fn::GetAtt': [
            'RQLB3B7B1CBC',
            'DNSName',
          ],
        },
        ':8080" \n' +
        'rm -f "/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: RQ_CONNECTION_ASSET.Key },
              ],
            },
          ],
        },
        '\"\n' +
        "mkdir -p $(dirname '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        '\')\naws s3 cp \'s3://',
        { Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket },
        '/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        '\' \'/tmp/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        "'\nmkdir -p $(dirname '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "')\naws s3 cp 's3://",
        { Ref: CONFIG_WORKER_ASSET_LINUX.Bucket },
        '/',
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "' '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "'\nset -e\nchmod +x '/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        "'\n'/tmp/",
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_LINUX.Key },
              ],
            },
          ],
        },
        `' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/`,
        {
          'Fn::Select': [
            0,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
        {
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '||',
                { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
              ],
            },
          ],
        },
      ],
    ],
  });
});

test('default worker fleet is created correctly with groups, pools and region', () => {
  vpc = new Vpc(stack, 'VPC1Az', {
    maxAzs: 1,
  });

  // WHEN
  const workers = new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': '123',
    }),
    renderQueue,
    instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
    vpcSubnets: {
      subnetType: SubnetType.PUBLIC,
    },
    groups: ['A', 'B'],
    pools: ['C', 'D'],
    region: 'E',
  });

  // THEN
  const userData = stack.resolve(workers.fleet.userData.render());
  expect(userData).toStrictEqual({
    'Fn::Join': ['', [
      '#!/bin/bash\nfunction exitTrap(){\nexitCode=$?\n/opt/aws/bin/cfn-signal --stack infraStack --resource workerFleetASG25520D69 --region us-east-1 -e $exitCode || echo \'Failed to send Cloudformation Signal\'\n}\ntrap exitTrap EXIT\nmkdir -p $(dirname \'/tmp/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      '\')\naws s3 cp \'s3://',
      {Ref: CWA_ASSET_LINUX.Bucket},
      '/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "' '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "'\nset -e\nchmod +x '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "'\n'/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CWA_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "' -i us-east-1 ",
      {Ref: 'workerFleetStringParameterDB3717DA'},
      '\nmkdir -p $(dirname \'/tmp/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      '\')\naws s3 cp \'s3://',
      {Ref: RQ_CONNECTION_ASSET.Bucket},
      '/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      "' '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      '\'\n' +
      'if [ -f \"/etc/profile.d/deadlineclient.sh\" ]; then\n' +
      '  source \"/etc/profile.d/deadlineclient.sh\"\n' +
      'fi\n' +
      '"${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "/tmp/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      '" --render-queue "http://',
      {
        'Fn::GetAtt': [
          'RQLB3B7B1CBC',
          'DNSName',
        ],
      },
      ':8080" \n' +
      'rm -f "/tmp/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: RQ_CONNECTION_ASSET.Key},
            ],
          },
        ],
      },
      '\"\n' +
      "mkdir -p $(dirname '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {
                Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
              },
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {
                Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
              },
            ],
          },
        ],
      },
      "')\naws s3 cp 's3://",
      {
        Ref: CONFIG_WORKER_ASSET_WINDOWS.Bucket,
      },
      '/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
            ],
          },
        ],
      },
      "' '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              { Ref: CONFIG_WORKER_ASSET_WINDOWS.Key },
            ],
          },
        ],
      },
      "'\nmkdir -p $(dirname '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "')\naws s3 cp 's3://",
      {Ref: CONFIG_WORKER_ASSET_LINUX.Bucket},
      '/',
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "' '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "'\nset -e\nchmod +x '/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      "'\n'/tmp/",
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {Ref: CONFIG_WORKER_ASSET_LINUX.Key},
            ],
          },
        ],
      },
      `' 'a,b' 'c,d' 'E' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/`,
      {
        'Fn::Select': [
          0,
          {
            'Fn::Split': [
              '||',
              {
                Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
              },
            ],
          },
        ],
      },
      {
        'Fn::Select': [
          1,
          {
            'Fn::Split': [
              '||',
              {
                Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
              },
            ],
          },
        ],
      },
    ]],
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
    expect(fleet.node.metadataEntry[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadataEntry[0].data).toMatch('being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');
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
    expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            Encrypted: true,
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    }));

    expect(fleet.node.metadataEntry).toHaveLength(0);
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
    expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            Encrypted: false,
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    }));

    expect(fleet.node.metadataEntry[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadataEntry[0].data).toMatch(`The BlockDevice \"${DEVICE_NAME}\" on the worker-fleet workerFleet is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`);
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
    expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          Ebs: {
            VolumeSize: VOLUME_SIZE,
          },
        },
      ],
    }));

    expect(fleet.node.metadataEntry[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadataEntry[0].data).toMatch(`The BlockDevice \"${DEVICE_NAME}\" on the worker-fleet workerFleet is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`);
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
    expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          DeviceName: DEVICE_NAME,
          VirtualName: 'ephemeral0',
        },
      ],
    }));

    expect(fleet.node.metadataEntry).toHaveLength(0);
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
    expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      BlockDeviceMappings: [
        {
          DeviceName: DEVICE_NAME,
        },
      ],
    }));

    expect(fleet.node.metadataEntry).toHaveLength(0);
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
    expect(userData).toMatch(new RegExp(escapeTokenRegex('&\'C:/temp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \'63415\' \'10.1.9.2\'')));
    // Ensure that the health monitor target group has been set up.
    //  Note: It's sufficient to just check for any resource created by the HealthMonitor registration.
    //   The HealthMonitor tests cover ensuring that all of the resources are set up.
    expectCDK(wfstack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckIntervalSeconds: 300,
      HealthCheckPort: '63415',
      HealthCheckProtocol: 'HTTP',
      Port: 8081,
      Protocol: 'HTTP',
      TargetType: 'instance',
    }));
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
    expect(userData).toMatch(new RegExp(escapeTokenRegex('\'/tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \'63415\' \'10.1.9.2\'')));
    // Ensure that the health monitor target group has been set up.
    //  Note: It's sufficient to just check for any resource created by the HealthMonitor registration.
    //   The HealthMonitor tests cover ensuring that all of the resources are set up.
    expectCDK(wfstack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckIntervalSeconds: 300,
      HealthCheckPort: '63415',
      HealthCheckProtocol: 'HTTP',
      Port: 8081,
      Protocol: 'HTTP',
      TargetType: 'instance',
    }));
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
  expectCDK(wfstack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: {
      ResourceSignal: {
        Count: 1,
      },
    },
  }, ResourcePart.CompleteDefinition));
  // [0] = warning about block devices. [1] = warning about no health monitor
  expect(fleet.node.metadataEntry).toHaveLength(2);
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
  expectCDK(wfstack).notTo(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    CreationPolicy: objectLike({}),
  }, ResourcePart.CompleteDefinition));
  // There should be a warning in the construct's metadata about deploying with no capacity.
  expect(fleet.node.metadataEntry).toHaveLength(3);
  // [0] = warning about block devices. [2] = warning about no health monitor
  expect(fleet.node.metadataEntry[1].type).toMatch(ArtifactMetadataEntryType.WARN);
  expect(fleet.node.metadataEntry[1].data).toMatch(/Deploying with 0 minimum capacity./);
});
