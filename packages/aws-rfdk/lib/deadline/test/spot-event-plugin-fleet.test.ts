/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

/* eslint-disable dot-notation */

import {
  arrayWith,
  countResources,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  objectLike,
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
  SubnetSelection,
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
import { tagFields } from '../../core/lib/runtime-info';
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

const groupName = 'group_name';
const deadlineGroups = [
  groupName,
];
const workerMachineImage = new GenericLinuxImage({
  'us-east-1': 'ami-any',
});
const instanceTypes = [
  InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
];
const maxCapacity = 1;

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

  describe('created with default values', () => {
    test('creates a security group', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.securityGroups).toBeDefined();
      expect(fleet.securityGroups.length).toBe(1);
      expectCDK(spotFleetStack).to(countResources('AWS::EC2::SecurityGroup', 1));
    });

    test('allows connection to the render queue', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        ToPort: parseInt(renderQueue.endpoint.portAsString(), 10),
        SourceSecurityGroupId: {
          'Fn::GetAtt': [
            spotFleetStack.getLogicalId(fleet.connections.securityGroups[0].node.defaultChild as CfnElement),
            'GroupId',
          ],
        },
      }));
    });

    test('creates a spot fleet instance role', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.fleetInstanceRole).toBeDefined();
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::Role', {
        AssumeRolePolicyDocument: objectLike({
          Statement: [objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'ec2.amazonaws.com',
            },
          })],
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
    });

    test('creates an instance profile', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.instanceProfile).toBeDefined();
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::InstanceProfile', {
        Roles: arrayWith({
          Ref: spotFleetStack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
        }),
      }));
    });

    test('creates a spot fleet role', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.fleetRole).toBeDefined();
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::IAM::Role', {
        AssumeRolePolicyDocument: objectLike({
          Statement: [objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'spotfleet.amazonaws.com',
            },
          })],
        }),
        ManagedPolicyArns: arrayWith(
          'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole',
        ),
      }));
    });

    test('adds group names to user data', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });
      const renderedUserData = fleet.userData.render();

      // THEN
      expect(fleet.userData).toBeDefined();
      expect(renderedUserData).toMatch(groupName);
    });

    test('does not add group names with wildcards to user data', () => {
      // GIVEN
      const wildcardGroupName = 'group_name*';

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        deadlineGroups: [
          wildcardGroupName,
        ],
      });
      const renderedUserData = fleet.userData.render();

      // THEN
      expect(fleet.userData).toBeDefined();
      expect(renderedUserData).not.toMatch(wildcardGroupName);
    });

    test('adds RFDK tags', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });
      const rfdkTag = tagFields(fleet);
      // TODO:
      // const resolvedTags = spotFleetStack.resolve(fleet.tags.renderTags());

      // THEN
      expect(fleet.tags).toBeDefined();
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
        Tags: arrayWith(
          objectLike({
            Key: rfdkTag.name,
            Value: rfdkTag.value,
          }),
        ),
      }));

      // TODO: returns empty array
      // expect(resolvedTags).toContainEqual({
      //   Key: rfdkTag.name,
      //   Value: rfdkTag.value,
      // });
    });

    test('uses default LogGroup prefix %s', () => {
      // GIVEN
      const id = 'SpotFleet';

      // WHEN
      new SpotEventPluginFleet(stack, id, {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      expectCDK(stack).to(haveResource('Custom::LogRetention', {
        RetentionInDays: 3,
        LogGroupName: '/renderfarm/' + id,
      }));
    });

    test('sets default allocation strategy', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.allocationStrategy).toEqual(SpotFleetAllocationStrategy.LOWEST_PRICE);
    });

    test('does not set valid until property', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.validUntil).toBeUndefined();
    });

    test('does not set valid block devices', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.blockDevices).toBeUndefined();
    });

    test('does not set ssh key', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.keyName).toBeUndefined();
    });
  });

  describe('created with custom values', () => {
    test('uses provided required properties', () => {
      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });
      const imageConfig = workerMachineImage.getImage(fleet);

      // THEN
      expect(fleet.deadlineGroups).toBe(deadlineGroups);
      expect(fleet.instanceTypes).toBe(instanceTypes);
      expect(fleet.imageId).toBe(imageConfig.imageId);
      expect(fleet.osType).toBe(imageConfig.osType);
      expect(fleet.maxCapacity).toBe(maxCapacity);
    });

    test('uses provided security group', () => {
      // GIVEN
      const sg = SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
        allowAllOutbound: false,
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        securityGroups: [
          sg,
        ],
      });

      // THEN
      expectCDK(spotFleetStack).notTo(haveResource('AWS::EC2::SecurityGroup'));
      expect(fleet.securityGroups.length).toBe(1);
      expect(fleet.securityGroups).toContainEqual(sg);
    });

    test('uses multiple provided security groups', () => {
      // GIVEN
      const sg1 = SecurityGroup.fromSecurityGroupId(stack, 'SG1', 'sg-123456789', {
        allowAllOutbound: false,
      });
      const sg2 = SecurityGroup.fromSecurityGroupId(stack, 'SG2', 'sg-987654321', {
        allowAllOutbound: false,
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        securityGroups: [
          sg1,
          sg2,
        ],
      });

      // THEN
      expectCDK(spotFleetStack).notTo(haveResource('AWS::EC2::SecurityGroup'));
      expect(fleet.securityGroups.length).toBe(2);
      expect(fleet.securityGroups).toContainEqual(sg1);
      expect(fleet.securityGroups).toContainEqual(sg2);
    });

    test('adds to provided user data', () => {
      // GIVEN
      const originalCommands = 'original commands';
      const originalUserData = workerMachineImage.getImage(spotFleetStack).userData;
      originalUserData.addCommands(originalCommands);
      const renderedOriginalUser = originalUserData.render();

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        userData: originalUserData,
      });
      const renderedUserData = fleet.userData.render();

      // THEN
      expect(fleet.userData).toBe(originalUserData);
      expect(renderedUserData).toMatch(new RegExp(escapeTokenRegex(originalCommands)));
      expect(renderedUserData).not.toEqual(renderedOriginalUser);
    });

    test('uses provided spot fleet instance role', () => {
      // GIVEN
      const spotFleetInstanceRole = new Role(stack, 'SpotFleetInstanceRole', {
        assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
        ],
      });

      // WHEN
      // TODO: Using spotFleetStack creates a circular dependency
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        fleetInstanceRole: spotFleetInstanceRole,
      });

      // THEN
      // Using spotFleetStack creates a circular dependency
      // expectCDK(spotFleetStack).notTo(haveResourceLike('AWS::IAM::Role', {...}));
      expect(fleet.fleetInstanceRole).toBe(spotFleetInstanceRole);
    });

    test('uses provided spot fleet role', () => {
      // GIVEN
      const fleetRole = new Role(stack, 'FleetRole', {
        assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromManagedPolicyArn(stack, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
        ],
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        fleetRole: fleetRole,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      expect(fleet.fleetRole).toBe(fleetRole);
      expectCDK(spotFleetStack).notTo(haveResourceLike('AWS::IAM::Role', {
        AssumeRolePolicyDocument: objectLike({
          Statement: [objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'spotfleet.amazonaws.com',
            },
          })],
        }),
        ManagedPolicyArns: arrayWith(
          'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole',
        ),
      }));
    });

    test('allows adding tags', () => {
      // GIVEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });
      const tagName = 'name';
      const tagValue = 'tagValue';

      // WHEN
      Tags.of(fleet).add(tagName, tagValue);
      // TODO:
      // const resolvedTags = spotFleetStack.resolve(fleet.tags.renderTags());

      // THEN
      expectCDK(spotFleetStack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
        Tags: arrayWith(
          objectLike({
            Key: tagName,
            Value: tagValue,
          }),
        ),
      }));

      // TODO: returns empty array
      // expect(resolvedTags).toContainEqual({
      //   Key: tagName,
      //   Value: tagValue,
      // });
    });

    test('uses provided subnets', () => {
      // GIVEN
      const privateSubnets: SubnetSelection = {
        subnetType: SubnetType.PRIVATE,
      };

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        vpcSubnets: privateSubnets,
      });
      const expectedSubnetId = stack.resolve(vpc.privateSubnets[0].subnetId);

      // THEN
      expect(stack.resolve(fleet.subnets.subnetIds)).toContainEqual(expectedSubnetId);
    });

    test('uses provided allocation strategy', () => {
      // GIVEN
      const allocationStartegy = SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED;

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        allocationStrategy: allocationStartegy,
      });

      // THEN
      expect(fleet.allocationStrategy).toEqual(allocationStartegy);
    });

    test('adds deadline region to user data', () => {
      // GIVEN
      const deadlineRegion = 'someregion';

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        deadlineRegion: deadlineRegion,
      });
      const renderedUserData = fleet.userData.render();

      // THEN
      expect(renderedUserData).toMatch(deadlineRegion);
    });

    test('adds deadline pools to user data', () => {
      // GIVEN
      const pool1 = 'pool1';
      const pool2 = 'pool2';

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        deadlinePools: [
          pool1,
          pool2,
        ],
      });
      const renderedUserData = fleet.userData.render();

      // THEN
      expect(renderedUserData).toMatch(pool1);
      expect(renderedUserData).toMatch(pool2);
    });

    test('uses provided ssh key name', () => {
      // GIVEN
      const keyName = 'test-key-name';

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        keyName: keyName,
      });

      // THEN
      expect(fleet.keyName).toEqual(keyName);
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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        userDataProvider: new UserDataProvider(spotFleetStack, 'UserDataProvider'),
      });

      const userData = fleet.userData.render();

      // THEN
      expect(userData).toContain('echo preCloudWatchAgent');
      expect(userData).toContain('echo preRenderQueueConfiguration');
      expect(userData).toContain('echo preWorkerConfiguration');
      expect(userData).toContain('echo postWorkerLaunch');
    });

    test.each([
      'test-prefix/',
      '',
    ])('uses custom LogGroup prefix %s', (testPrefix: string) => {
      // GIVEN
      const id = 'SpotFleet';

      // WHEN
      new SpotEventPluginFleet(stack, id, {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        logGroupProps: {
          logGroupPrefix: testPrefix,
        },
      });

      expectCDK(stack).to(haveResource('Custom::LogRetention', {
        RetentionInDays: 3,
        LogGroupName: testPrefix + id,
      }));
    });
  });

  describe('allowing remote control', () => {
    test('from CIDR', () => {
      // GIVEN
      const fromPort = 56032;
      const maxWorkersPerHost = 8;

      // WHEN
      const fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      fleet.allowRemoteControlFrom(Peer.ipv4('127.0.0.1/24'));

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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
      });

      fleet.allowRemoteControlTo(Peer.ipv4('127.0.0.1/24'));

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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
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
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
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

  describe('validation with', () => {
    describe('instance types', () => {
      test('throws with empty', () => {
        // GIVEN
        const emptyInstanceTypes: InstanceType[] = [];

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            deadlineGroups,
            instanceTypes: emptyInstanceTypes,
            workerMachineImage,
            maxCapacity,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/At least one instance type is required for a Spot Fleet Request Configuration/);
      });

      test('passes with at least one', () => {
        // GIVEN
        const oneInstanceType = [ InstanceType.of(InstanceClass.T2, InstanceSize.SMALL) ];

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            deadlineGroups,
            instanceTypes: oneInstanceType,
            workerMachineImage,
            maxCapacity,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).not.toThrowError();
      });
    });

    describe('subnets', () => {
      test('error if no subnets provided', () => {
        // GIVEN
        const invalidSubnets = {
          subnetType: SubnetType.PRIVATE,
          availabilityZones: ['dummy zone'],
        };

        // WHEN
        const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
          vpc,
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
          vpcSubnets: invalidSubnets,
        });

        // THEN
        expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.ERROR);
        expect(fleet.node.metadata[0].data).toMatch(/Did not find any subnets matching/);
      });
    });

    describe('groups', () => {
      test('throws with empty', () => {
        // GIVEN
        const emptyDeadlineGroups: string[] = [];

        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineGroups: emptyDeadlineGroups,
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/At least one Deadline Group is required for a Spot Fleet Request Configuration/);
      });

      test.each([
        'none',
        'with space',
      ])('throws with %s', (invalidGroupName: string) => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineGroups: [invalidGroupName],
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrowError(/Invalid value: .+ for property 'deadlineGroups'/);
      });

      test.each([
        groupName,
        'group_*', // with wildcard
      ])('passes with %s', (validGroupName: string) => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineGroups: [validGroupName],
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
      ])('throws with %s', (deadlineRegion: string) => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            deadlineGroups,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineRegion: deadlineRegion,
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
            renderQueue,
            deadlineGroups,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineRegion: deadlineRegion,
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
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
        });
        expect(fleet.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
        expect(fleet.node.metadata[0].data).toMatch('being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.');
      });

      test('No Warnings if Encrypted BlockDevices Provided', () => {
        const VOLUME_SIZE = 50;

        // WHEN
        const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
          vpc,
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
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
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
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
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
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
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
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
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
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
