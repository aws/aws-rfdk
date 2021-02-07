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
  Stack,
} from '@aws-cdk/core';
import {
  ConfigureSpotEventPlugin,
  IRenderQueue,
  IVersion,
  RenderQueue,
  Repository,
  SpotEventPluginConfiguration,
  SpotEventPluginAwsInstanceStatus,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginState,
  VersionQuery,
} from '../lib';
import {
  SpotEventPluginFleet,
} from '../lib/sep-spotfleet';

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

    fleet = new SpotEventPluginFleet(stack, 'SpotFleet1', {
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
      targetCapacity: 1,
    });
  });

  test('creates a default custom resource correctly', () => {
    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      configuration: {
        spotFleets: [
          fleet,
        ],
      },
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
          IamFleetRole: {
            'Fn::GetAtt': [
              stack.getLogicalId(fleet.fleetRole.node.defaultChild as CfnElement),
              'Arn',
            ],
          },
          LaunchSpecifications: arrayWith(
            objectLike({
              IamInstanceProfile: {
                Arn: {
                  'Fn::GetAtt': [
                    'SpotFleet1InstanceProfile06EAADB7',
                    'Arn',
                  ],
                },
              },
              ImageId: 'ami-any',
              SecurityGroups: arrayWith(
                objectLike({
                  GroupId: {
                    'Fn::GetAtt': [
                      stack.getLogicalId(fleet.securityGroups[0].node.defaultChild as CfnElement),
                      'GroupId',
                    ],
                  },
                }),
              ),
              SubnetId: {
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
              TagSpecifications: arrayWith(
                objectLike({
                  ResourceType: 'instance',
                  Tags: arrayWith(
                    objectLike({
                      Key: 'aws-rfdk',
                    }),
                  ),
                }),
              ),
              UserData: objectLike({}),
              InstanceType: 't2.small',
            }),
          ),
          ReplaceUnhealthyInstances: true,
          TargetCapacity: 1,
          TerminateInstancesWithExpiration: true,
          Type: 'maintain',
          TagSpecifications: arrayWith(
            objectLike({
              ResourceType: 'spot-fleet-request',
              Tags: arrayWith(
                objectLike({
                  Key: 'aws-rfdk',
                }),
              ),
            }),
          ),
        }),
      }),
      spotPluginConfigurations: objectLike({
        AWSInstanceStatus: 'Disabled',
        DeleteInterruptedSlaves: false,
        DeleteTerminatedSlaves: false,
        IdleShutdown: 10,
        Logging: 'Standard',
        PreJobTaskMode: 'Conservative',
        Region: `${region}`,
        ResourceTracker: true,
        StaggerInstances: 50,
        State: 'Disabled',
        StrictHardCap: false,
      }),
    })));
  });

  test('only one object allowed per render queue', () => {
    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
      configuration: {
        spotFleets: [
          fleet,
        ],
      },
    });

    // THEN
    expect(() => {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
        vpc,
        renderQueue: renderQueue,
        version,
        configuration: {
          spotFleets: [
            fleet,
          ],
        },
      });
    }).toThrowError(/Only one ConfigureSpotEventPlugin construct is allowed per render queue./);
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
      configuration: {
        spotFleets: [
          fleet,
        ],
      },
    });

    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
      vpc,
      renderQueue: renderQueue2,
      version,
      configuration: {
        spotFleets: [
          fleet,
        ],
      },
    });

    // THEN
    cdkExpect(stack).to(countResources('Custom::RFDK_ConfigureSpotEventPlugin', 2));
  });

  test('throws with the same group name', () => {
    // THEN
    expect(() => {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        version,
        configuration: {
          spotFleets: [
            fleet,
            fleet,
          ],
        },
      });
    }).toThrowError(/Bad Group Name: group_name1. Group names in Spot Fleet Request Configurations should be unique./);
  });

  test('uses selected subnets', () => {
    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      vpcSubnets: { subnets: [ vpc.privateSubnets[0] ] },
      renderQueue: renderQueue,
      version,
      configuration: {
        spotFleets: [
          fleet,
        ],
      },
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

      // THEN
      expect(() => {
        new ConfigureSpotEventPlugin(newStack, 'ConfigureSpotEventPlugin', {
          vpc,
          renderQueue: renderQueue,
          version,
          configuration: {
            spotFleets: [
              fleet,
            ],
          },
        });
      }).toThrowError(`Minimum supported Deadline version for ConfigureSpotEventPlugin is 10.1.12.0. Received: ${versionString}.`);
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

    // THEN
    expect(() => {
      new ConfigureSpotEventPlugin(newStack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        version,
        configuration: {
          spotFleets: [
            fleet,
          ],
        },
      });
    }).not.toThrow();
  });

  test('uses custom spot event properties', () => {
    // GIVEN
    const configuration: SpotEventPluginConfiguration = {
      awsInstanceStatus: SpotEventPluginAwsInstanceStatus.EXTRA_INOF_0,
      deleteEC2SpotInterruptedWorkers: true,
      deleteSEPTerminatedWorkers: true,
      idleShutdown: 20,
      loggingLevel: SpotEventPluginLoggingLevel.VERBOSE,
      preJobTaskMode: SpotEventPluginPreJobTaskMode.NORMAL,
      region: 'us-west-2',
      enableResourceTracker: false,
      maximumInstancesStartedPerCycle: 10,
      state: SpotEventPluginState.GLOBAL_ENABLED,
      strictHardCap: true,
      spotFleets: [
        fleet,
      ],
    };

    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version,
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
