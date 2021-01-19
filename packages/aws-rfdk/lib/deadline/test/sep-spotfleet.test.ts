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
  SEPSpotFleetAllocationStrategy,
  SEPSpotFleet,
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
  spotFleetStack = new Stack(app, 'spotFleetStack', {
    env: {
      region: 'us-east-1',
    },
  });
});

test('default spot fleet is created correctly', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.userData).toBeDefined();
  expect(fleet.connections).toBeDefined();
  expect(fleet.env).toBeDefined();
  expect(fleet.grantPrincipal).toBeDefined();
  expect(fleet.instanceTags).toBeDefined();
  expect(fleet.spotFleetRequestTags).toBeDefined();
  expect(fleet.listeningPorts).toBeDefined();
  expect(fleet.osType).toBeDefined();
  expect(fleet.role).toBeDefined();
  expect(fleet.securityGroups).toBeDefined();
  expect(fleet.userData).toBeDefined();

  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();

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
    LogGroupName: '/renderfarm/spotFleet',
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
  new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
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
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    role: expectedRole,
  });

  // THEN
  expect(fleet.role).toBe(expectedRole);
});

test('deafult role is created automatically if not provided', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  expect(fleet.role).toBeDefined();

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
      Ref: 'spotFleetSpotWorkerRoleD6ECB6B7',
    }),
  }));
});

test('fleet role is always created automatically', () => {
  // WHEN
  new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
  });

  // THEN
  // TOOD: rewrite this unit-test
  // expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::Role', {
  //   AssumeRolePolicyDocument: objectLike({
  //     Statement: [
  //       {
  //         Action: 'sts:AssumeRole',
  //         Effect: 'Allow',
  //         Principal: {
  //           Service: 'ec2.amazonaws.com',
  //         },
  //       },
  //     ],
  //   }),
  //   ManagedPolicyArns: arrayWith(
  //     objectLike({
  //       'Fn::Join': arrayWith(
  //         [
  //           'arn:',
  //           {
  //             Ref: 'AWS::Partition',
  //           },
  //           ':iam::aws:policy/AmazonEC2SpotFleetTaggingRole',
  //         ],
  //       ),
  //     }),
  //   ),
  // }));
});

test('user data is added correctly', () => {
  // GIVEN
  const workerMachineImage = new GenericWindowsImage({
    'us-east-1': 'ami-any',
  });
  const imageConfig = workerMachineImage.getImage(spotFleetStack);
  let originalUserData = imageConfig.userData;
  originalUserData.addCommands('some command');

  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
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
  const originalCommands = 'some command';
  expect(userData).toMatch(new RegExp(escapeTokenRegex(originalCommands)));

  const newCommands = 'mkdir';
  expect(userData).toMatch(new RegExp(escapeTokenRegex(newCommands)));
});

test('instance tags are added correctly', () => {
  // GIVEN
  const someTag = {
    key: 'name',
    value: 'tagValue',
  };

  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    instanceTags: [ someTag ],
  });

  // THEN
  expect(fleet.instanceTags).toBeDefined();
  expect(fleet.instanceTags).toContain(someTag);
});

test('spot fleet request tags are added correctly', () => {
  // GIVEN
  const someTag = {
    key: 'name',
    value: 'tagValue',
  };

  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    spotFleetRequestTags: [ someTag ],
  });

  // THEN
  expect(fleet.spotFleetRequestTags).toBeDefined();
  expect(fleet.spotFleetRequestTags).toContain(someTag);
});

test('works fine if no subnets provided', () => {
  // GIVEN
  const invalidSubnets = {
    subnetType: SubnetType.PRIVATE,
    availabilityZones: ['dummy zone'],
  };

  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    vpcSubnets: invalidSubnets,
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if subnets provided', () => {
  // GIVEN
  const invalidSubnets = {
    subnetType: SubnetType.PRIVATE,
  };

  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    vpcSubnets: invalidSubnets,
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if allocation strategy provided', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    allocationStrategy: SEPSpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if deadline region provided', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    deadlineRegion: 'someregion',
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if log group is provided', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    logGroupProps: {
      bucketName: 'test-bucket',
    },
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
});

test('works fine if key name is provided', () => {
  // WHEN
  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    targetCapacity: 1,
    keyName: 'test-key-name',
  });

  // THEN
  expect(fleet.sepSpotFleetRequestConfigurations).toBeDefined();
  expect(fleet.sepSpotFleetRequestConfigurations).toHaveLength(1);
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

  const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
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

describe('allowing log listener port', () => {
  test('from CIDR', () => {
    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
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
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    }));
  });

  test('to CIDR', () => {
    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
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
          ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
        },
      ],
    }));
  });

  test('from SecurityGroup', () => {
    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowListenerPortFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('to SecurityGroup', () => {
    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

    fleet.allowListenerPortTo(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('from other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowListenerPortFrom(securityGroup);

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
    }));
  });

  test('to other stack', () => {
    const otherStack = new Stack(app, 'otherStack', {
      env: { region: 'us-east-1' },
    });

    // WHEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
    const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

    fleet.allowListenerPortTo(securityGroup);

    // THEN
    expectCDK(otherStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'],
      IpProtocol: 'tcp',
      SourceSecurityGroupId: 'sg-123456789',
      ToPort: WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT'] + SEPSpotFleet['MAX_WORKERS_PER_HOST'],
    }));
  });
});

test.each([
  'test-prefix/',
  '',
])('default worker fleet is created correctly with custom LogGroup prefix %s', (testPrefix: string) => {
  // GIVEN
  const id  = 'spotFleet';

  // WHEN
  new SEPSpotFleet(stack, id, {
    vpc,
    renderQueue: renderQueue,
    deadlineGroups: [
      'group_name',
    ],
    instanceTypes: [
      InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
    ],
    workerMachineImage: new GenericWindowsImage({
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

test('worker fleet does validation correctly with instance types, groups, and region', () => {
  // empty instance types array
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet0', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });
  }).toThrowError(/SEPSpotFleet: At least one Deadline Group is required for a Spot Fleet Request Configuration/);

  // empty groups array
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet1', {
      vpc,
      renderQueue: renderQueue,
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineGroups: [],
    });
  }).toThrowError(/SEPSpotFleet: At least one Deadline Group is required for a Spot Fleet Request Configuration/);

  // group name as 'none'
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet2', {
      vpc,
      renderQueue: renderQueue,
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineGroups: ['A', 'none'],
    });
  }).toThrowError();

  // group name with whitespace
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet3', {
      vpc,
      renderQueue: renderQueue,
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineGroups: ['A', 'no ne'],
    });
  }).toThrowError(/Invalid value: no ne for property 'deadlineGroups'/);

  // region as 'none'
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet4', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'none',
    });
  }).toThrowError(/Invalid value: none for property 'region'/);

  // region as 'all'
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet5', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'all',
    });
  }).toThrowError(/Invalid value: all for property 'region'/);

  // region as 'unrecognized'
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet6', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'unrecognized',
    });
  }).toThrowError(/Invalid value: unrecognized for property 'region'/);

  // region with invalid characters
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet7', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'none@123',
    });
  }).toThrowError(/Invalid value: none@123 for property 'region'/);

  // region with reserved name as substring
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet8', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'none123',
    });
  }).not.toThrowError();

  // region with case-insensitive name
  expect(() => {
    new SEPSpotFleet(stack, 'spotFleet9', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
      deadlineRegion: 'None',
    });
  }).toThrowError(/Invalid value: None for property 'region'/);
});

describe('Block Device Tests', () => {

  test('Warning if no BlockDevices provided', () => {
    const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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
    const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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
    const id = 'spotFleet';

    // WHEN
    const fleet = new SEPSpotFleet(spotFleetStack, id, {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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
    const id = 'spotFleet';

    // WHEN
    const fleet = new SEPSpotFleet(spotFleetStack, id, {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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
    const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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
    const fleet = new SEPSpotFleet(spotFleetStack, 'spotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
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