/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

/* eslint-disable dot-notation */

import {
  arrayWith,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  objectLike,
  stringLike,
} from '@aws-cdk/assert';
import {
  BlockDeviceVolume,
} from '@aws-cdk/aws-autoscaling';
import {
  GenericLinuxImage,
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
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import { ArtifactMetadataEntryType } from '@aws-cdk/cloud-assembly-schema';
import {
  App,
  CfnElement,
  Stack,
  Tags,
} from '@aws-cdk/core';
import {
  escapeTokenRegex,
} from '../../core/test/token-regex-helpers';
import {
  IHost,
  InstanceUserDataProvider,
  IRenderQueue,
  RenderQueue,
  Repository,
  VersionQuery,
  WorkerInstanceConfiguration,
  SpotEventPluginFleet,
  SpotFleetAllocationStrategy,
} from '../lib';

let app: App;
let stack: Stack;
let spotFleetStack: Stack;
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
  spotFleetStack = new Stack(app, 'SpotFleetStack', {
    env: {
      region: 'us-east-1',
    },
  });
});

test('default spot fleet is created correctly', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.connections).toBeDefined();
  expect(fleet.env).toBeDefined();
  expect(fleet.fleetRole).toBeDefined();
  expect(fleet.grantPrincipal).toBeDefined();
  expect(fleet.remoteControlPorts).toBeDefined();
  expect(fleet.osType).toBeDefined();
  expect(fleet.securityGroups).toBeDefined();
  expect(fleet.userData).toBeDefined();
  expect(fleet.fleetInstanceRole).toBeDefined();

  expect(fleet.spotFleetRequestConfigurations).toBeDefined();

  expectCDK(spotFleetStack).to(haveResource('AWS::EC2::SecurityGroup'));
  expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    ToPort: parseInt(renderQueue.endpoint.portAsString(), 10),
    SourceSecurityGroupId: {
      'Fn::GetAtt': [
        stack.getLogicalId(fleet.connections.securityGroups[0].node.defaultChild as CfnElement),
        'GroupId',
      ],
    },
    GroupId: {
      'Fn::ImportValue': 'infraStack:ExportsOutputFnGetAttRQLBSecurityGroupAC643AEDGroupId8F9F7830',
    },
  }));
  expectCDK(spotFleetStack).to(haveResource('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: '/renderfarm/SpotFleet',
  }));
  expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
  expect(fleet.node.metadata[0].data).toMatch('being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');

});

test('security group is not created if provided', () => {
  // GIVEN
  const sg = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
    allowAllOutbound: false,
  });

  // WHEN
  new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    securityGroups: [
      sg,
    ],
  });

  // THEN
  expectCDK(spotFleetStack).notTo(haveResource('AWS::EC2::SecurityGroup'));
});

test('setting role works correctly', () => {
  // GIVEN
  const roleName = 'DeadlineSpotWorkerRole';
  const expectedRole = new Role(stack, 'SpotWorkerRole', {
    assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
    ],
    roleName: roleName,
  });

  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    fleetInstanceRole: expectedRole,
  });

  // THEN
  expect(fleet.fleetInstanceRole).toBe(expectedRole);
});

test('default role is created automatically if not provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.fleetInstanceRole).toBeDefined();

  expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::Role', {
    AssumeRolePolicyDocument: objectLike({
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ec2.amazonaws.com',
          },
        },
      ],
    }),
    ManagedPolicyArns: arrayWith(
      objectLike({
        'Fn::Join': arrayWith(
          [
            'arn:',
            {
              Ref: 'AWS::Partition',
            },
            ':iam::aws:policy/AWSThinkboxDeadlineSpotEventPluginWorkerPolicy',
          ],
        ),
      }),
    ),
    RoleName: stringLike('DeadlineSpot*'),
  }));

  expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::InstanceProfile', {
    Roles: arrayWith({
      Ref: stack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
    }),
  }));
});

test('setting fleet role works correctly', () => {
  // GIVEN
  const expectedFleetRole = new Role(stack, 'FleetRole', {
    assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
    managedPolicies: [
      ManagedPolicy.fromManagedPolicyArn(stack, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
    ],
  });

  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    fleetRole: expectedFleetRole,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.fleetRole).toBe(expectedFleetRole);
});

test('default fleet role is created automatically if not provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.fleetRole).toBeDefined();

  expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::Role', {
    AssumeRolePolicyDocument: objectLike({
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'spotfleet.amazonaws.com',
          },
        },
      ],
    }),
    ManagedPolicyArns: arrayWith(
      'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole',
    ),
  }));
});

test('user data is added correctly', () => {
  // GIVEN
  const workerMachineImage = new GenericLinuxImage({
    'us-east-1': 'ami-any',
  });
  const imageConfig = workerMachineImage.getImage(spotFleetStack);
  let originalUserData = imageConfig.userData;
  const originalCommands = 'some command';
  originalUserData.addCommands(originalCommands);

  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage,
    targetCapacity: 1,
    userData: originalUserData,
  });

  // THEN
  expect(fleet.userData).toBeDefined();

  const userData = fleet.userData.render();
  expect(userData).toMatch(new RegExp(escapeTokenRegex(originalCommands)));

  const newCommands = 'mkdir';
  expect(userData).toMatch(new RegExp(escapeTokenRegex(newCommands)));
});

test('can add tags', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  Tags.of(fleet).add('name', 'tagValue');
});

test('works fine if no subnets provided', () => {
  // GIVEN
  const invalidSubnets = {
    subnetType: SubnetType.PRIVATE,
    availabilityZones: ['dummy zone'],
  };

  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    vpcSubnets: invalidSubnets,
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if subnets provided', () => {
  // GIVEN
  const invalidSubnets = {
    subnetType: SubnetType.PRIVATE,
  };

  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    vpcSubnets: invalidSubnets,
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if allocation strategy provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    allocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if deadline region provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    deadlineRegion: 'someregion',
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if log group is provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    logGroupProps: {
      bucketName: 'test-bucket',
    },
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if key name is provided', () => {
  // WHEN
  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    keyName: 'test-key-name',
  });

  // THEN
  expect(fleet.spotFleetRequestConfigurations).toBeDefined();
  expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
});

test('UserData is added by UserDataProvider', () => {
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

  const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    userDataProvider: new UserDataProvider(spotFleetStack, 'UserDataProvider'),
  });

  const userData = fleet.userData.render();

  // THEN
  expect(userData).toContain('echo preCloudWatchAgent');
  expect(userData).toContain('echo preRenderQueueConfiguration');
  expect(userData).toContain('echo preWorkerConfiguration');
  expect(userData).toContain('echo postWorkerLaunch');
});

describe('allowing remote control', () => {
  test('from CIDR', () => {
    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });

    fleet.allowRemoteControlFrom(Peer.ipv4('127.0.0.1/24').connections);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
      SecurityGroupIngress: [
        {
          CidrIp: '127.0.0.1/24',
          Description: 'Worker remote command listening port',
          FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
          IpProtocol: 'tcp',
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    }));
  });

  test('to CIDR', () => {
    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });

    fleet.allowRemoteControlTo(Peer.ipv4('127.0.0.1/24').connections);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
      SecurityGroupIngress: [
        {
          CidrIp: '127.0.0.1/24',
          Description: 'Worker remote command listening port',
          FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
          IpProtocol: 'tcp',
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    }));
  });

  test('from SecurityGroup', () => {
    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowRemoteControlFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('to SecurityGroup', () => {
    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowRemoteControlTo(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('from other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowRemoteControlFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('to other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowRemoteControlTo(securityGroup);

    // THEN
    expectCDK(otherStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SpotEventPluginFleet['MAX_WORKERS_PER_HOST'],
    }));
  });
});

test.each([
  'test-prefix/',
  '',
])('default worker fleet is created correctly with custom LogGroup prefix %s', (testPrefix: string) => {
  // GIVEN
  const id = 'SpotFleet';

  // WHEN
  new SpotEventPluginFleet(stack, id, {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericLinuxImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    logGroupProps: {
      logGroupPrefix: testPrefix,
    },
  });

  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    RetentionInDays: 3,
    LogGroupName: testPrefix + id,
  }));
});

describe('validation with', () => {
  describe('instance types', () => {
    test('throws with empty', () => {
      // GIVEN
      const instanceTypes: InstanceType[] = [];

      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          deadlineGroups: [
            'group_name',
          ],
          instanceTypes,
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
        });
      }).toThrowError(/At least one instance type is required for a Spot Fleet Request Configuration/);
    });

    test('passes with at least one', () => {
      // GIVEN
      const instanceTypes: InstanceType[] = [ InstanceType.of(InstanceClass.T2, InstanceSize.SMALL) ];

      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          deadlineGroups: [
            'group_name',
          ],
          instanceTypes,
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
        });
      }).not.toThrowError();
    });
  });

  describe('groups', () => {
    test('throws with empty', () => {
      // GIVEN
      const deadlineGroups: string[] = [];

      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
          deadlineGroups,
        });
      }).toThrowError(/At least one Deadline Group is required for a Spot Fleet Request Configuration/);
    });

    test.each([
      'none',
      'with space',
    ])('throws with %s', (groupName: string) => {
      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
          deadlineGroups: [groupName],
        });
      }).toThrowError(/Invalid value: .+ for property 'deadlineGroups'/);
    });

    test.each([
      'group_name',
      'group_*', // with wildcard
    ])('passes with %s', (groupName: string) => {
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
          deadlineGroups: [groupName],
        });
      }).not.toThrowError();
    });
  });

  describe('region', () => {
    test.each([
      'none', // region as 'none'
      'all', // region as 'all'
      'unrecognized', // region as 'unrecognized'
      'none@123', // region with invalid characters
      'None', // region with case-insensitive name
    ])('throws with %s', (region: string) => {
      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          deadlineGroups: [
            'group_name',
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
          deadlineRegion: region,
        });
      }).toThrowError(/Invalid value: .+ for property 'deadlineRegion'/);
    });

    test('passes with reserved name as substring', () => {
      // GIVEN
      const deadlineRegion = 'none123';

      // THEN
      expect(() => {
        new SpotEventPluginFleet(stack, 'SpotFleet9', {
          vpc,
          renderQueue: renderQueue,
          deadlineGroups: [
            'group_name',
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          targetCapacity: 1,
          deadlineRegion,
        });
      }).not.toThrowError();
    });
  });
});

describe('Block Device Tests', () => {
  test('Warning if no BlockDevices provided', () => {
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadata[0].data).toMatch('being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');
  });

  test('No Warnings if Encrypted BlockDevices Provided', () => {
    const VOLUME_SIZE = 50;

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      blockDevices: [ {
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE, {encrypted: true}),
      }],
    });

    //THEN
    expect(fleet.node.metadata).toHaveLength(0);
  });

  test('Warnings if non-Encrypted BlockDevices Provided', () => {
    const VOLUME_SIZE = 50;
    const DEVICE_NAME = '/dev/xvda';
    const id = 'SpotFleet';

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, id, {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE, {encrypted: false}),
      }],
    });

    //THEN
    expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadata[0].data).toMatch(`The BlockDevice \"${DEVICE_NAME}\" on the spot-fleet ${id} is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`);
  });

  test('Warnings for BlockDevices without encryption specified', () => {
    const VOLUME_SIZE = 50;
    const DEVICE_NAME = '/dev/xvda';
    const id = 'SpotFleet';

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, id, {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ebs( VOLUME_SIZE ),
      }],
    });

    //THEN
    expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
    expect(fleet.node.metadata[0].data).toMatch(`The BlockDevice \"${DEVICE_NAME}\" on the spot-fleet ${id} is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`);
  });

  test('No warnings for Ephemeral blockDeviceVolumes', () => {
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.ephemeral( 0 ),
      }],
    });

    //THEN
    expect(fleet.node.metadata).toHaveLength(0);
  });

  test('No warnings for Suppressed blockDeviceVolumes', () => {
    const DEVICE_NAME = '/dev/xvda';

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      blockDevices: [ {
        deviceName: DEVICE_NAME,
        volume: BlockDeviceVolume.noDevice(),
      }],
    });

    //THEN
    expect(fleet.node.metadata).toHaveLength(0);
  });
});
