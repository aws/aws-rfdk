/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as cdkExpect,
  countResources,
  haveResourceLike,
  objectLike,
  arrayWith,
} from '@aws-cdk/assert';
import {
  GenericWindowsImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  App,
  CfnElement,
  Duration,
  Stack,
} from '@aws-cdk/core';
import {
  ConfigureSpotEventPlugin,
  IRenderQueue,
  IVersion,
  RenderQueue,
  Repository,
  SpotEventPluginAwsInstanceStatus,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginSettings,
  SpotEventPluginState,
  VersionQuery,
} from '../lib';
import {
  SpotEventPluginFleet,
} from '../lib/spot-event-plugin-fleet';

describe('ConfigureSpotEventPlugin', () => {
  let stack: Stack;
  let vpc: Vpc;
  let region: string;
  let renderQueue: IRenderQueue;
  let version: IVersion;
  let app: App;
  let fleet: SpotEventPluginFleet;
  let groupName: string;

  beforeEach(() => {
    region = 'us-east-1';
    app = new App();
    stack = new Stack(app, 'stack', {
      env: {
        region,
      },
    });
    vpc = new Vpc(stack, 'Vpc');

    version = new VersionQuery(stack, 'Version');

    renderQueue = new RenderQueue(stack, 'RQ', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(stack, 'Repository', {
        vpc,
        version,
      }),
      version,
    });

    groupName = 'group_name1';

    fleet = new SpotEventPluginFleet(stack, 'SpotFleet', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        groupName,
      ],
      deadlinePools: [
        'pool1',
        'pool2',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      maxCapacity: 1,
    });
  });

  test('creates a default custom resource correctly', () => {
    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      spotFleets: [
        fleet,
      ],
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
      connection: objectLike({
        hostname: {
          'Fn::GetAtt': [
            'RQLB3B7B1CBC',
            'DNSName',
          ],
        },
        port: '8080',
        protocol: 'HTTP',
      }),
      spotFleetRequestConfigurations: objectLike({
        [groupName]: objectLike({
          iamFleetRole: {
            'Fn::GetAtt': [
              stack.getLogicalId(fleet.fleetRole.node.defaultChild as CfnElement),
              'Arn',
            ],
          },
          launchSpecifications: arrayWith(
            objectLike({
              iamInstanceProfile: {
                arn: {
                  'Fn::GetAtt': [
                    'SpotFleetInstanceProfile9F9AFBE3',
                    'Arn',
                  ],
                },
              },
              imageId: 'ami-any',
              securityGroups: arrayWith(
                objectLike({
                  groupId: {
                    'Fn::GetAtt': [
                      stack.getLogicalId(fleet.securityGroups[0].node.defaultChild as CfnElement),
                      'GroupId',
                    ],
                  },
                }),
              ),
              subnetId: {
                'Fn::Join': [
                  '',
                  [
                    {
                      Ref: 'VpcPrivateSubnet1Subnet536B997A',
                    },
                    ',',
                    {
                      Ref: 'VpcPrivateSubnet2Subnet3788AAA1',
                    },
                  ],
                ],
              },
              tagSpecifications: arrayWith(
                objectLike({
                  resourceType: 'instance',
                  tags: arrayWith(
                    objectLike({
                      Key: 'aws-rfdk',
                    }),
                  ),
                }),
              ),
              userData: objectLike({}),
              instanceType: 't2.small',
            }),
          ),
          replaceUnhealthyInstances: true,
          targetCapacity: 1,
          terminateInstancesWithExpiration: true,
          type: 'maintain',
          tagSpecifications: arrayWith(
            objectLike({
              resourceType: 'spot-fleet-request',
              tags: arrayWith(
                objectLike({
                  Key: 'aws-rfdk',
                }),
              ),
            }),
          ),
        }),
      }),
    })));
  });

  test('only one object allowed per render queue', () => {
    // GIVEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      spotFleets: [
        fleet,
      ],
    });

    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
        vpc,
        renderQueue: renderQueue,
        version,
        spotFleets: [
          fleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).toThrowError(/Only one ConfigureSpotEventPlugin construct is allowed per render queue./);
  });

  test('can create multiple objects with different render queues', () => {
    // GIVEN
    const renderQueue2 = new RenderQueue(stack, 'RQ2', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(stack, 'Repository2', {
        vpc,
        version,
      }),
      version,
    });

    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      spotFleets: [
        fleet,
      ],
    });

    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
      vpc,
      renderQueue: renderQueue2,
      version,
      spotFleets: [
        fleet,
      ],
    });

    // THEN
    cdkExpect(stack).to(countResources('Custom::RFDK_ConfigureSpotEventPlugin', 2));
  });

  test('throws with the same group name', () => {
    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        version,
        spotFleets: [
          fleet,
          fleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).toThrowError(`Bad Group Name: ${groupName}. Group names in Spot Fleet Request Configurations should be unique.`);
  });

  test('uses selected subnets', () => {
    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      vpcSubnets: { subnets: [ vpc.privateSubnets[0] ] },
      renderQueue: renderQueue,
      version,
      spotFleets: [
        fleet,
      ],
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'configure-spot-event-plugin.configureSEP',
      VpcConfig: {
        SubnetIds: [
          {
            Ref: 'VpcPrivateSubnet1Subnet536B997A',
          },
        ],
      },
    }));
  });

  describe('throws with wrong deadline version', () => {
    test.each([
      ['10.1.9'],
      ['10.1.10'],
    ])('%s', (versionString: string) => {
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      version = new VersionQuery(newStack, 'OldVersion', {
        version: versionString,
      });

      renderQueue = new RenderQueue(newStack, 'OldRenderQueue', {
        vpc,
        images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
        repository: new Repository(newStack, 'Repository', {
          vpc,
          version,
        }),
        version,
      });

      // WHEN
      function createConfigureSpotEventPlugin() {
        new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
          vpc,
          renderQueue: renderQueue,
          version,
          spotFleets: [
            fleet,
          ],
        });
      }

      // THEN
      expect(createConfigureSpotEventPlugin).toThrowError(`Minimum supported Deadline version for ConfigureSpotEventPlugin is 10.1.12.0. Received: ${versionString}.`);
    });
  });

  test('does not throw with min deadline version', () => {
    // GIVEN
    const versionString = '10.1.12';
    const newStack = new Stack(app, 'NewStack');
    version = new VersionQuery(newStack, 'OldVersion', {
      version: versionString,
    });

    renderQueue = new RenderQueue(newStack, 'OldRenderQueue', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(newStack, 'Repository', {
        vpc,
        version,
      }),
      version,
    });

    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(newStack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        version,
        spotFleets: [
          fleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).not.toThrow();
  });

  test('uses custom spot event properties', () => {
    // GIVEN
    const configuration: SpotEventPluginSettings = {
      awsInstanceStatus: SpotEventPluginAwsInstanceStatus.EXTRA_INFO_0,
      deleteEC2SpotInterruptedWorkers: true,
      deleteSEPTerminatedWorkers: true,
      idleShutdown: Duration.minutes(20),
      loggingLevel: SpotEventPluginLoggingLevel.VERBOSE,
      preJobTaskMode: SpotEventPluginPreJobTaskMode.NORMAL,
      region: 'us-west-2',
      enableResourceTracker: false,
      maximumInstancesStartedPerCycle: 10,
      state: SpotEventPluginState.GLOBAL_ENABLED,
      strictHardCap: true,
    };

    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      spotFleets: [
        fleet,
      ],
      configuration,
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
      spotPluginConfigurations: objectLike({
        AWSInstanceStatus: 'ExtraInfo0',
        DeleteInterruptedSlaves: true,
        DeleteTerminatedSlaves: true,
        IdleShutdown: 20,
        Logging: 'Verbose',
        PreJobTaskMode: 'Normal',
        Region: 'us-west-2',
        ResourceTracker: false,
        StaggerInstances: 10,
        State: 'Global Enabled',
        StrictHardCap: true,
      }),
    })));
  });
});
