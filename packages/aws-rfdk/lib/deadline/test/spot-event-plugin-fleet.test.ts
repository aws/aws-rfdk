/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

/* eslint-disable dot-notation */

import {
  App,
  CfnElement,
  Stack,
  Tags,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
} from 'aws-cdk-lib/aws-autoscaling';
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
} from 'aws-cdk-lib/aws-ec2';
import {
  AssetImage,
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { tagFields } from '../../core/lib/runtime-info';
import {
  escapeTokenRegex,
} from '../../core/test/token-regex-helpers';
import { LaunchTemplateConfig } from '../../lambdas/nodejs/configure-spot-event-plugin';
import {
  IHost,
  InstanceUserDataProvider,
  IRenderQueue,
  RenderQueue,
  Repository,
  VersionQuery,
  SpotEventPluginFleet,
  SpotFleetAllocationStrategy,
  SpotFleetResourceType,
} from '../lib';
import { resourcePropertiesCountIs } from './test-helper';

let app: App;
let stack: Stack;
let spotFleetStack: Stack;
let vpc: IVpc;
let renderQueue: IRenderQueue;
let rcsImage: AssetImage;

const groupName = 'Group_Name';
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
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
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
      Template.fromStack(spotFleetStack).resourceCountIs('AWS::EC2::SecurityGroup', 1);
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
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        ToPort: parseInt(renderQueue.endpoint.portAsString(), 10),
        SourceSecurityGroupId: spotFleetStack.resolve(fleet.connections.securityGroups[0].securityGroupId),
      });
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
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'ec2.amazonaws.com',
            },
          })],
        }),
        ManagedPolicyArns: Match.arrayWith([
          spotFleetStack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy').managedPolicyArn),
        ]),
      });
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
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::IAM::InstanceProfile', {
        Roles: Match.arrayWith([{
          Ref: spotFleetStack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
        }]),
      });
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
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'spotfleet.amazonaws.com',
            },
          })],
        }),
        ManagedPolicyArns: Match.arrayWith([
          spotFleetStack.resolve(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2SpotFleetTaggingRole').managedPolicyArn),
        ]),
      });
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
      expect(renderedUserData).toMatch(groupName.toLocaleLowerCase());
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

      // THEN
      expect(fleet.tags).toBeDefined();
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::SecurityGroup', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: rfdkTag.name,
            Value: rfdkTag.value,
          }),
        ]),
      });
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

      Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
        RetentionInDays: 3,
        LogGroupName: '/renderfarm/' + id,
      });
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

    test('creates launch template configs for each instance type', () => {
      // WHEN
      const moreInstanceTypes: InstanceType[] = [
        new InstanceType('t2.small'),
        new InstanceType('c5.large'),
      ];
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        workerMachineImage,
        maxCapacity,
        instanceTypes: moreInstanceTypes,
      });

      // THEN
      expect(fleet._launchTemplateConfigs.length).toBeGreaterThanOrEqual(moreInstanceTypes.length);
      moreInstanceTypes.forEach(instanceType => {
        expect(fleet._launchTemplateConfigs.some(ltc => {
          return (ltc as LaunchTemplateConfig).Overrides.some(override => override.InstanceType === instanceType.toString());
        })).toBeTruthy();
      });
    });

    test('creates launch template configs for each subnet id', () => {
      // WHEN
      const subnets = vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS });
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        instanceTypes,
        deadlineGroups,
        workerMachineImage,
        maxCapacity,
        vpcSubnets: subnets,
      });

      // THEN
      expect(fleet._launchTemplateConfigs.length).toBeGreaterThanOrEqual(subnets.subnets.length);
      subnets.subnetIds.forEach(subnetId => {
        expect(fleet._launchTemplateConfigs.some(ltc => {
          return (ltc as LaunchTemplateConfig).Overrides.some(override => override.SubnetId === subnetId);
        })).toBeTruthy();
      });
    });

    test('add tag indicating resource tracker is enabled', () => {
      // WHEN
      new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        instanceTypes,
        deadlineGroups,
        workerMachineImage,
        maxCapacity,
      });

      // THEN
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::LaunchTemplate', {
        LaunchTemplateData: Match.objectLike({
          TagSpecifications: Match.arrayWith([
            {
              ResourceType: 'instance',
              Tags: Match.arrayWith([
                {
                  Key: 'DeadlineTrackedAWSResource',
                  Value: 'SpotEventPlugin',
                },
              ]),
            },
          ]),
        }),
      });
    });

    test('adds multiple fleet security groups to launch template', () => {
      // GIVEN
      const securityGroups = [
        new SecurityGroup(stack, 'NewFleetSecurityGroup1', { vpc }),
        new SecurityGroup(stack, 'NewFleetSecurityGroup2', { vpc }),
      ];

      // WHEN
      new SpotEventPluginFleet(spotFleetStack, 'SpotFleet2', {
        vpc,
        renderQueue,
        deadlineGroups: ['group2'],
        instanceTypes: [new InstanceType('t2.micro')],
        workerMachineImage,
        maxCapacity: 1,
        securityGroups,
      });

      // THEN
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::LaunchTemplate', {
        LaunchTemplateData: Match.objectLike({
          SecurityGroupIds: securityGroups.map(sg => spotFleetStack.resolve(sg.securityGroupId)),
        }),
      });
    });

    test('adds fleet tags to launch template', () => {
      // GIVEN
      const tag = {
        key: 'mykey',
        value: 'myvalue',
      };
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        instanceTypes,
        deadlineGroups,
        workerMachineImage,
        maxCapacity,
      });

      // WHEN
      Tags.of(fleet).add(tag.key, tag.value);

      // THEN
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::LaunchTemplate', {
        LaunchTemplateData: Match.objectLike({
          TagSpecifications: Match.arrayWith([{
            ResourceType: SpotFleetResourceType.INSTANCE.toString(),
            Tags: Match.arrayWith([
              {
                Key: tag.key,
                Value: tag.value,
              },
            ]),
          }]),
        }),
      });
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
      expect(fleet.deadlineGroups).toStrictEqual(deadlineGroups.map(group => group.toLocaleLowerCase()));
      expect(fleet.instanceTypes).toBe(instanceTypes);
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
      Template.fromStack(spotFleetStack).resourceCountIs('AWS::EC2::SecurityGroup', 0);
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
      Template.fromStack(spotFleetStack).resourceCountIs('AWS::EC2::SecurityGroup', 0);
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

    test('uses provided spot fleet instance role from the same stack', () => {
      // GIVEN
      const spotFleetInstanceRole = new Role(spotFleetStack, 'SpotFleetInstanceRole', {
        assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
        ],
      });

      // WHEN
      const fleet = new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        fleetInstanceRole: spotFleetInstanceRole,
      });

      // THEN
      expect(fleet.fleetInstanceRole).toBe(spotFleetInstanceRole);
      resourcePropertiesCountIs(spotFleetStack, 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'ec2.amazonaws.com',
              },
            }),
          ]),
        }),
        ManagedPolicyArns: Match.arrayWith([
          spotFleetStack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy').managedPolicyArn),
        ]),
      }, 1);
    });

    test('throws if provided spot fleet instance role is not from the same stack', () => {
      // GIVEN
      const otherStack = new Stack(app, 'OtherStack', {
        env: { region: 'us-east-1' },
      });
      const spotFleetInstanceRole = new Role(otherStack, 'SpotFleetInstanceRole', {
        assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
        ],
      });

      // WHEN
      function createSpotEventPluginFleet() {
        new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
          vpc,
          renderQueue,
          deadlineGroups,
          instanceTypes,
          workerMachineImage,
          maxCapacity,
          fleetInstanceRole: spotFleetInstanceRole,
        });
      }

      // THEN
      expect(createSpotEventPluginFleet).toThrow('Fleet instance role should be created on the same stack as SpotEventPluginFleet to avoid circular dependencies.');
    });

    test('uses provided spot fleet role', () => {
      // GIVEN
      const fleetRole = new Role(stack, 'FleetRole', {
        assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2SpotFleetTaggingRole'),
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
      resourcePropertiesCountIs(spotFleetStack, 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'spotfleet.amazonaws.com',
              },
            }),
          ]),
        }),
        ManagedPolicyArns: Match.arrayWith([
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2SpotFleetTaggingRole').managedPolicyArn),
        ]),
      }, 0);
    });

    test('tags resources deployed by CDK', () => {
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

      // THEN
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::SecurityGroup', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: tagName,
            Value: tagValue,
          }),
        ]),
      });
    });

    test('uses provided subnets', () => {
      // GIVEN
      const privateSubnets: SubnetSelection = {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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

    test('.defaultSubnets is false when subnets provided', () => {
      // GIVEN
      const privateSubnets: SubnetSelection = {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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

      // THEN
      expect(fleet.defaultSubnets).toBeFalsy();
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
      const pool1 = 'Pool1';
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
      expect(renderedUserData).toMatch(pool1.toLocaleLowerCase());
      expect(renderedUserData).toMatch(pool2.toLocaleLowerCase());
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
      const logGroupProps = {
        logGroupPrefix: testPrefix,
      };

      // WHEN
      new SpotEventPluginFleet(stack, id, {
        vpc,
        renderQueue,
        deadlineGroups,
        instanceTypes,
        workerMachineImage,
        maxCapacity,
        logGroupProps: logGroupProps,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
        RetentionInDays: 3,
        LogGroupName: testPrefix + id,
      });
    });

    test('adds tag indicating resource tracker is not enabled', () => {
      // WHEN
      new SpotEventPluginFleet(spotFleetStack, 'SpotFleet', {
        vpc,
        renderQueue,
        instanceTypes,
        deadlineGroups,
        workerMachineImage,
        maxCapacity,
        trackInstancesWithResourceTracker: false,
      });

      // THEN
      Template.fromStack(spotFleetStack).hasResourceProperties('AWS::EC2::LaunchTemplate', {
        LaunchTemplateData: Match.objectLike({
          TagSpecifications: Match.arrayWith([{
            ResourceType: 'instance',
            Tags: Match.arrayWith([
              {
                Key: 'DeadlineResourceTracker',
                Value: 'SpotEventPlugin',
              },
            ]),
          }]),
        }),
      });
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
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
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
      });
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
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
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
      });
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
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      });
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
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      });
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
      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      });
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
      Template.fromStack(otherStack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        FromPort: fromPort,
        IpProtocol: 'tcp',
        SourceSecurityGroupId: 'sg-123456789',
        ToPort: fromPort + maxWorkersPerHost,
      });
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
        expect(createSpotEventPluginFleet).toThrow(/At least one instance type is required for a Spot Fleet Request Configuration/);
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
        expect(createSpotEventPluginFleet).not.toThrow();
      });
    });

    describe('subnets', () => {
      test('error if no subnets provided', () => {
        // GIVEN
        const invalidSubnets = {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
        Annotations.fromStack(spotFleetStack).hasError(
          `/${fleet.node.path}`,
          Match.stringLikeRegexp('Did not find any subnets matching.*'),
        );
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
        expect(createSpotEventPluginFleet).toThrow(/At least one Deadline Group is required for a Spot Fleet Request Configuration/);
      });

      test.each([
        'none',
        'with space',
        'group_*', // with wildcard
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
        expect(createSpotEventPluginFleet).toThrow(/Invalid value: .+ for property 'deadlineGroups'/);
      });

      test('passes with valid group name', () => {
        // WHEN
        function createSpotEventPluginFleet() {
          new SpotEventPluginFleet(stack, 'SpotFleet', {
            vpc,
            renderQueue,
            instanceTypes,
            workerMachineImage,
            maxCapacity,
            deadlineGroups: [groupName],
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).not.toThrow();
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
        expect(createSpotEventPluginFleet).toThrow(/Invalid value: .+ for property 'deadlineRegion'/);
      });

      test('passes with reserved name as substring', () => {
        // GIVEN
        const deadlineRegion = 'none123';

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
        expect(createSpotEventPluginFleet).not.toThrow();
      });
    });

    describe('Block Device Tests', () => {
      test('Warning if no BlockDevices provided', () => {
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
        Annotations.fromStack(spotFleetStack).hasWarning(
          `/${fleet.node.path}`,
          Match.stringLikeRegexp('.*being created without being provided any block devices so the Source AMI\'s devices will be used. Workers can have access to sensitive data so it is recommended to either explicitly encrypt the devices on the worker fleet or to ensure the source AMI\'s Drives are encrypted.'),
        );
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
        Annotations.fromStack(spotFleetStack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
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
        Annotations.fromStack(spotFleetStack).hasWarning(
          `/${fleet.node.path}`,
          `The BlockDevice \"${DEVICE_NAME}\" on the spot-fleet ${id} is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`,
        );
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
        Annotations.fromStack(spotFleetStack).hasWarning(
          `/${fleet.node.path}`,
          `The BlockDevice \"${DEVICE_NAME}\" on the spot-fleet ${id} is not encrypted. Workers can have access to sensitive data so it is recommended to encrypt the devices on the worker fleet.`,
        );
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
        Annotations.fromStack(spotFleetStack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
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
        Annotations.fromStack(spotFleetStack).hasNoInfo(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoWarning(`/${fleet.node.path}`, Match.anyValue());
        Annotations.fromStack(spotFleetStack).hasNoError(`/${fleet.node.path}`, Match.anyValue());
      });

      test('throws if block devices without iops and wrong volume type', () => {
        // GIVEN
        const deviceName = '/dev/xvda';
        const volumeSize = 50;
        const volumeType = EbsDeviceVolumeType.IO1;

        // WHEN
        function createSpotEventPluginFleet() {
          return new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
            vpc,
            renderQueue,
            deadlineGroups: [
              groupName,
            ],
            instanceTypes: [
              InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
            ],
            workerMachineImage,
            maxCapacity: 1,
            blockDevices: [{
              deviceName,
              volume: BlockDeviceVolume.ebs(volumeSize, {
                volumeType,
              }),
            }],
          });
        }

        // THEN
        expect(createSpotEventPluginFleet).toThrow(/iops property is required with volumeType: EbsDeviceVolumeType.IO1/);
      });

      test('warning if block devices with iops and wrong volume type', () => {
        // GIVEN
        const deviceName = '/dev/xvda';
        const volumeSize = 50;
        const iops = 100;
        const volumeType = EbsDeviceVolumeType.STANDARD;

        // WHEN
        const fleet = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
          vpc,
          renderQueue,
          deadlineGroups: [
            groupName,
          ],
          instanceTypes: [
            InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
          ],
          workerMachineImage,
          maxCapacity: 1,
          blockDevices: [{
            deviceName,
            volume: BlockDeviceVolume.ebs(volumeSize, {
              iops,
              volumeType,
            }),
          }],
        });

        // THEN
        Annotations.fromStack(stack).hasWarning(
          `/${fleet.node.path}`,
          'iops will be ignored without volumeType: EbsDeviceVolumeType.IO1',
        );
      });
    });
  });
});
