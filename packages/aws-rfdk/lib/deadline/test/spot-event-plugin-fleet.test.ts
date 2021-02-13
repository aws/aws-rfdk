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
  SpotEventPluginFleet,
  SpotFleetAllocationStrategy,
} from '../lib';

let app: App;
let stack: Stack;
let spotFleetStack: Stack;
let vpc: IVpc;
let renderQueue: IRenderQueue;
let rcsImage: AssetImage;
let groupName: string = 'group_name';

describe('SpotEventPluginFleet', () => {
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

  describe('created with defaults', () => {
    test('default spot fleet is created correctly', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });

      // THEN
      expect(fleet.connections).toBeDefined();
      expect(fleet.fleetRole).toBeDefined();
      expect(fleet.grantPrincipal).toBeDefined();
      expect(fleet.remoteControlPorts).toBeDefined();
      expect(fleet.osType).toBeDefined();
      expect(fleet.securityGroups).toBeDefined();
      expect(fleet.userData).toBeDefined();
      expect(fleet.fleetInstanceRole).toBeDefined();

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

    test('default role is created automatically if not provided', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
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
      }));

      expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::InstanceProfile', {
        Roles: arrayWith({
          Ref: stack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
        }),
      }));

      // const launchSpecification = fleet.spotFleetRequestConfigurations[0][groupName].launchSpecifications[0];
      // const instanceProfile = spotFleetStack.resolve(launchSpecification.iamInstanceProfile.arn);
      // expect(instanceProfile).toBeDefined();
    });

    test('default fleet role is created automatically if not provided', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
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

    test('user data is added by worker configuration', () => {
      // GIVEN
      const workerMachineImage = new GenericLinuxImage({
        'us-east-1': 'ami-any',
      });
      const imageConfig = workerMachineImage.getImage(spotFleetStack);
      const originalCommands = 'original commands';
      let originalUserData = imageConfig.userData;
      originalUserData.addCommands(originalCommands);
      const originalUserDataSring = originalUserData.render();

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage,
        maxCapacity: 1,
        userData: originalUserData,
      });

      // THEN
      expect(fleet.userData).toBeDefined();

      const userData = fleet.userData.render();
      expect(userData).toMatch(new RegExp(escapeTokenRegex(originalCommands)));
      expect(userData).not.toEqual(originalUserDataSring);
    });

    test('tags are cadded correctly', () => {
      // GIVEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });
      // TODO
      // const expectedTag = {
      //   Key: 'name',
      //   Value: 'tagValue',
      // };

      // WHEN
      Tags.of(fleet).add('name', 'tagValue');

      // THEN
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
        Tags: arrayWith(
          objectLike({
            Key: 'aws-rfdk',
            Value: stringLike('*SpotEventPluginFleet'),
          }),
        ),
      }));
      // const resolvedTags = spotFleetStack.resolve(fleet.spotFleetRequestConfigurations[0][groupName].tagSpecifications);
      // expect(resolvedTags[0].tags).toContainEqual(expectedTag);
    });
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
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      securityGroups: [
        sg,
      ],
    });

    // THEN
    expectCDK(spotFleetStack).notTo(haveResource('AWS::EC2::SecurityGroup'));
  });

  test('setting role works correctly', () => {
    // GIVEN
    const expectedRole = new Role(stack, 'SpotWorkerRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
      ],
    });

    // WHEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      fleetInstanceRole: expectedRole,
    });

    // THEN
    expect(fleet.fleetInstanceRole).toBe(expectedRole);
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
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
    });

    // THEN
    expect(fleet.fleetRole).toBe(expectedFleetRole);
  });

  // TODO: no need for rfdk tag here
  test('tags are cadded correctly', () => {
    // GIVEN
    const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
    });
    // TODO
    // const expectedTag = {
    //   Key: 'name',
    //   Value: 'tagValue',
    // };

    // WHEN
    Tags.of(fleet).add('name', 'tagValue');

    // THEN
    expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
      Tags: arrayWith(
        objectLike({
          Key: 'aws-rfdk',
          Value: stringLike('*SpotEventPluginFleet'),
        }),
      ),
    }));

    // TODO
    // const resolvedTags = spotFleetStack.resolve(fleet.spotFleetRequestConfigurations[0][groupName].tagSpecifications);
    // expect(resolvedTags[0].tags).toContainEqual(expectedTag);
  });

  test('does not set subnetId if no subnets provided', () => {
    // GIVEN
    const invalidSubnets = {
      subnetType: SubnetType.PRIVATE,
      availabilityZones: ['dummy zone'],
    };

    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      vpcSubnets: invalidSubnets,
    });

    // THEN
    // const subnetId = fleet.spotFleetRequestConfigurations[0][groupName].launchSpecifications[0].subnetId;
    // expect(subnetId).toBeUndefined();
  });

  test('adds subnetIds to spot fleet request configuration', () => {
    // GIVEN
    const privateSubnets = {
      subnetType: SubnetType.PRIVATE,
    };
    // TODO:
    // const expectedSubnetId = stack.resolve(vpc.privateSubnets[0]);

    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      vpcSubnets: privateSubnets,
    });

    // THEN
    // const receivedSubnetId = fleet.spotFleetRequestConfigurations[0][groupName].launchSpecifications[0].subnetId;
    // expect(receivedSubnetId).toBeDefined();
    // TODO: expect(receivedSubnetId).toEqual(expectedSubnetId);
  });

  test('adds allocation strategy to spot fleet request configuration', () => {
    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      allocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
    });

    // THEN
    // const allocationStrategy = fleet.spotFleetRequestConfigurations[0][groupName].allocationStrategy;
    // expect(allocationStrategy).toEqual('capacityOptimized');
  });

  test('works fine if deadline region provided', () => {
    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      deadlineRegion: 'someregion',
    });

    // // THEN
    // expect(fleet.spotFleetRequestConfigurations).toBeDefined();
    // expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
  });

  test('works fine if log group is provided', () => {
    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      logGroupProps: {
        bucketName: 'test-bucket',
      },
    });

    // // THEN
    // expect(fleet.spotFleetRequestConfigurations).toBeDefined();
    // expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
  });

  test('works fine if key name is provided', () => {
    // WHEN
    new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
      keyName: 'test-key-name',
    });

    // // THEN
    // expect(fleet.spotFleetRequestConfigurations).toBeDefined();
    // expect(fleet.spotFleetRequestConfigurations).toHaveLength(1);
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
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
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
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });

      fleet.allowRemoteControlFrom(Peer.ipv4('127.0.0.1/24').connections);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
        SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
        SecurityGroupIngress: [
          {
            CidrIp: '127.0.0.1/24',
            Description: 'Worker remote command listening port',
            FromPort: fromPort,
            IpProtocol: 'tcp',
            ToPort: fromPort + maxWorkersPerHost,
          },
        ],
      }));
    });

    test('to CIDR', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });

      fleet.allowRemoteControlTo(Peer.ipv4('127.0.0.1/24').connections);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
        SecurityGroupEgress: [{ CidrIp: '0.0.0.0/0' }],
        SecurityGroupIngress: [
          {
            CidrIp: '127.0.0.1/24',
            Description: 'Worker remote command listening port',
            FromPort: fromPort,
            IpProtocol: 'tcp',
            ToPort: fromPort + maxWorkersPerHost,
          },
        ],
      }));
    });

    test('from SecurityGroup', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });
      const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

      fleet.allowRemoteControlFrom(securityGroup);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      }));
    });

    test('to SecurityGroup', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });
      const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789');

      fleet.allowRemoteControlTo(securityGroup);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      }));
    });

    test('from other stack', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;
      const otherStack = new Stack(app, 'otherStack', {
        env: { region: 'us-east-1' },
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });
      const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

      fleet.allowRemoteControlFrom(securityGroup);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      }));
    });

    test('to other stack', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;
      const otherStack = new Stack(app, 'otherStack', {
        env: { region: 'us-east-1' },
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue: renderQueue,
        deadlineGroups: [
          groupName,
        ],
        instanceTypes: [
          InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        ],
        workerMachineImage: new GenericLinuxImage({
          'us-east-1': 'ami-any',
        }),
        maxCapacity: 1,
      });
      const securityGroup = SecurityGroup.fromSecurityGroupId(otherStack, 'SG', 'sg-123456789');

      fleet.allowRemoteControlTo(securityGroup);

      // THEN
      expectCDK(otherStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
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
        groupName,
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericLinuxImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
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

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            deadlineGroups: [
              groupName,
            ],
            instanceTypes,
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/At least one instance type is required for a Spot Fleet Request Configuration/);
      });

      test('passes with at least one', () => {
        // GIVEN
        const instanceTypes: InstanceType[] = [ InstanceType.of(InstanceClass.T2, InstanceSize.SMALL) ];

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            deadlineGroups: [
              groupName,
            ],
            instanceTypes,
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).not.toThrowError();
      });
    });

    describe('groups', () => {
      test('throws with empty', () => {
        // GIVEN
        const deadlineGroups: string[] = [];

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            instanceTypes: [
              InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            ],
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
            deadlineGroups,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/At least one Deadline Group is required for a Spot Fleet Request Configuration/);
      });

      test.each([
        'none',
        'with space',
      ])('throws with %s', (group: string) => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            instanceTypes: [
              InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            ],
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
            deadlineGroups: [group],
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/Invalid value: .+ for property 'deadlineGroups'/);
      });

      test.each([
        groupName,
        'group_*', // with wildcard
      ])('passes with %s', (group: string) => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            instanceTypes: [
              InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            ],
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
            deadlineGroups: [group],
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).not.toThrowError();
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
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue: renderQueue,
            deadlineGroups: [
              groupName,
            ],
            instanceTypes: [
              InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            ],
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
            deadlineRegion: region,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/Invalid value: .+ for property 'deadlineRegion'/);
      });

      test('passes with reserved name as substring', () => {
        // GIVEN
        const deadlineRegion = 'none123';

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet9', {
            vpc,
            renderQueue: renderQueue,
            deadlineGroups: [
              groupName,
            ],
            instanceTypes: [
              InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            ],
            workerMachineImage: new GenericLinuxImage({
              'us-east-1': 'ami-any',
            }),
            maxCapacity: 1,
            deadlineRegion,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).not.toThrowError();
      });
    });

    describe('Block Device Tests', () => {
      test('Warning if no BlockDevices provided', () => {
        const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
          vpc,
          renderQueue: renderQueue,
          deadlineGroups: [
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
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
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
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
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
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
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
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
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
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
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
          ],
          workerMachineImage: new GenericLinuxImage({
            'us-east-1': 'ami-any',
          }),
          maxCapacity: 1,
          blockDevices: [ {
            deviceName: DEVICE_NAME,
            volume: BlockDeviceVolume.noDevice(),
          }],
        });

        //THEN
        expect(fleet.node.metadata).toHaveLength(0);
      });
    });
  });
});
