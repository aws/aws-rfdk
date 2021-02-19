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
  countResourcesLike,
} from '@aws-cdk/assert';
import {
  BlockDeviceVolume, EbsDeviceVolumeType,
} from '@aws-cdk/aws-autoscaling';
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
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import { ArtifactMetadataEntryType } from '@aws-cdk/cloud-assembly-schema';
import {
  App,
  CfnElement,
  Duration,
  Expiration,
  Fn,
  Stack,
} from '@aws-cdk/core';
import { X509CertificatePem } from '../../core';
import { tagFields } from '../../core/lib/runtime-info';
import {
  ConfigureSpotEventPlugin,
  IRenderQueue,
  IVersion,
  RenderQueue,
  Repository,
  SpotEventPluginDisplayInstanceStatus,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginSettings,
  SpotEventPluginState,
  SpotFleetResourceType,
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
  const workerMachineImage = new GenericWindowsImage({
    'us-east-1': 'ami-any',
  });

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
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage,
      maxCapacity: 1,
    });
  });

  describe('creates a custom resource', () => {
    test('with default spot event plugin properties', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotPluginConfigurations: objectLike({
          AWSInstanceStatus: 'Disabled',
          DeleteInterruptedSlaves: false,
          DeleteTerminatedSlaves: false,
          IdleShutdown: 10,
          Logging: 'Standard',
          PreJobTaskMode: 'Conservative',
          Region: Stack.of(renderQueue).region,
          ResourceTracker: true,
          StaggerInstances: 50,
          State: 'Global Enabled',
          StrictHardCap: false,
        }),
      })));
    });

    test('with custom spot event plugin properties', () => {
      // GIVEN
      const configuration: SpotEventPluginSettings = {
        awsInstanceStatus: SpotEventPluginDisplayInstanceStatus.EXTRA_INFO_0,
        deleteEC2SpotInterruptedWorkers: true,
        deleteSEPTerminatedWorkers: true,
        idleShutdown: Duration.minutes(20),
        loggingLevel: SpotEventPluginLoggingLevel.VERBOSE,
        preJobTaskMode: SpotEventPluginPreJobTaskMode.NORMAL,
        region: 'us-west-2',
        enableResourceTracker: false,
        maximumInstancesStartedPerCycle: 10,
        state: SpotEventPluginState.DISABLED,
        strictHardCap: true,
      };

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
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
          State: 'Disabled',
          StrictHardCap: true,
        }),
      })));
    });

    test('without spot fleets', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
      });

      // THEN
      cdkExpect(stack).notTo(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', {
        spotFleetRequestConfigurations: expect.any(Object),
      }));
    });

    test('with connection', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
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
      })));
    });

    test('with default spot fleet request configuration', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
        ],
      });
      const rfdkTag = tagFields(fleet);

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            AllocationStrategy: fleet.allocationStrategy.toString(),
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
                      stack.getLogicalId(fleet.instanceProfile as CfnElement),
                      'Arn',
                    ],
                  },
                },
                ImageId: fleet.imageId,
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
                        Ref: stack.getLogicalId(vpc.privateSubnets[0].node.defaultChild as CfnElement),
                      },
                      ',',
                      {
                        Ref: stack.getLogicalId(vpc.privateSubnets[1].node.defaultChild as CfnElement),
                      },
                    ],
                  ],
                },
                TagSpecifications: arrayWith(
                  objectLike({
                    ResourceType: 'instance',
                    Tags: arrayWith(
                      objectLike({
                        Key: rfdkTag.name,
                        Value: rfdkTag.value,
                      }),
                    ),
                  }),
                ),
                UserData: stack.resolve(Fn.base64(fleet.userData.render())),
                InstanceType: fleet.instanceTypes[0].toString(),
              }),
            ),
            ReplaceUnhealthyInstances: true,
            TargetCapacity: fleet.maxCapacity,
            TerminateInstancesWithExpiration: true,
            Type: 'maintain',
            TagSpecifications: arrayWith(
              objectLike({
                ResourceType: 'spot-fleet-request',
                Tags: arrayWith(
                  objectLike({
                    Key: rfdkTag.name,
                    Value: rfdkTag.value,
                  }),
                ),
              }),
            ),
          }),
        }),
      })));
    });

    test('adds policies to the render queue', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
        ],
      });

      // THEN
      cdkExpect(stack).to(countResourcesLike('AWS::IAM::Role', 1, {
        ManagedPolicyArns: arrayWith(
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineSpotEventPluginAdminPolicy',
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
                ':iam::aws:policy/AWSThinkboxDeadlineResourceTrackerAdminPolicy',
              ],
            ],
          },
        ),
      }));

      cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 'iam:PassRole',
              Condition: {
                StringLike: {
                  'iam:PassedToService': 'ec2.amazonaws.com',
                },
              },
              Effect: 'Allow',
              Resource: [
                {
                  'Fn::GetAtt': [
                    stack.getLogicalId(fleet.fleetRole.node.defaultChild as CfnElement),
                    'Arn',
                  ],
                },
                {
                  'Fn::GetAtt': [
                    stack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
                    'Arn',
                  ],
                },
              ],
            },
            {
              Action: 'ec2:CreateTags',
              Effect: 'Allow',
              Resource: 'arn:aws:ec2:*:*:spot-fleet-request/*',
            },
          ],
        },
        Roles: [{
          Ref: 'RQRCSTaskTaskRole00DC9B43',
        }],
      }));
    });

    test('does not add resource tracker policy if rt disabled', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
        ],
        configuration: {
          enableResourceTracker: false,
        },
      });

      // THEN
      cdkExpect(stack).notTo(haveResourceLike('AWS::IAM::Role', {
        ManagedPolicyArns: arrayWith(
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineResourceTrackerAdminPolicy',
              ],
            ],
          },
        ),
      }));
    });

    test.each([
      undefined,
      [],
    ])('without spot fleet', (noFleets: any) => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: noFleets,
      });

      // THEN
      cdkExpect(stack).notTo(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({}),
      })));

      cdkExpect(stack).notTo(haveResourceLike('AWS::IAM::Role', {
        ManagedPolicyArns: arrayWith(
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':iam::aws:policy/AWSThinkboxDeadlineSpotEventPluginAdminPolicy',
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
                ':iam::aws:policy/AWSThinkboxDeadlineResourceTrackerAdminPolicy',
              ],
            ],
          },
        ),
      }));

      cdkExpect(stack).notTo(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 'iam:PassRole',
              Condition: {
                StringLike: {
                  'iam:PassedToService': 'ec2.amazonaws.com',
                },
              },
              Effect: 'Allow',
              Resource: [
                {
                  'Fn::GetAtt': [
                    stack.getLogicalId(fleet.fleetRole.node.defaultChild as CfnElement),
                    'Arn',
                  ],
                },
                {
                  'Fn::GetAtt': [
                    stack.getLogicalId(fleet.fleetInstanceRole.node.defaultChild as CfnElement),
                    'Arn',
                  ],
                },
              ],
            },
            {
              Action: 'ec2:CreateTags',
              Effect: 'Allow',
              Resource: 'arn:aws:ec2:*:*:spot-fleet-request/*',
            },
          ],
        },
        Roles: [{
          Ref: 'RQRCSTaskTaskRole00DC9B43',
        }],
      }));
    });

    test('fleet with validUntil', () => {
      // GIVEN
      const validUntil = Expiration.atDate(new Date(2022, 11, 17));
      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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
        validUntil,
      });

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            ValidUntil: validUntil.date.toUTCString(),
          }),
        }),
      })));
    });

    test('fleet with block devices', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const volumeSize = 50;
      const encrypted = true;
      const deleteOnTermination = true;
      const iops = 100;
      const volumeType = EbsDeviceVolumeType.STANDARD;

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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
            encrypted,
            deleteOnTermination,
            iops,
            volumeType,
          }),
        }],
      });

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                Ebs: objectLike({
                  DeleteOnTermination: deleteOnTermination,
                  Iops: iops,
                  VolumeSize: volumeSize,
                  VolumeType: volumeType,
                  Encrypted: encrypted,
                }),
              })),
            })),
          }),
        }),
      })));
    });

    test('fleet with block devices with custom volume', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const virtualName = 'name';
      const snapshotId = 'snapshotId';
      const volumeSize = 50;
      const deleteOnTermination = true;
      const iops = 100;
      const volumeType = EbsDeviceVolumeType.STANDARD;

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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
          deviceName: deviceName,
          volume: {
            ebsDevice: {
              deleteOnTermination,
              iops,
              volumeSize,
              volumeType,
              snapshotId,
            },
            virtualName,
          },
        }],
      });

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      cdkExpect(stack).notTo(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                Ebs: objectLike({
                  Encrypted: true,
                }),
              })),
            })),
          }),
        }),
      })));

      cdkExpect(stack).notTo(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                Ebs: objectLike({
                  Encrypted: false,
                }),
              })),
            })),
          }),
        }),
      })));

      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                Ebs: objectLike({
                  SnapshotId: snapshotId,
                  DeleteOnTermination: deleteOnTermination,
                  Iops: iops,
                  VolumeSize: volumeSize,
                  VolumeType: volumeType,
                }),
                VirtualName: virtualName,
              })),
            })),
          }),
        }),
      })));
    });

    test('fleet with block devices with no device', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const volume = BlockDeviceVolume.noDevice();

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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
          deviceName: deviceName,
          volume,
        }],
      });

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                NoDevice: '',
              })),
            })),
          }),
        }),
      })));
    });

    test('fleet with deprecated mappingEnabled', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const mappingEnabled = false;

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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
          deviceName: deviceName,
          volume: BlockDeviceVolume.ebs(50),
          mappingEnabled,
        }],
      });

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        spotFleetRequestConfigurations: objectLike({
          [groupName]: objectLike({
            LaunchSpecifications: arrayWith(objectLike({
              BlockDeviceMappings: arrayWith(objectLike({
                DeviceName: deviceName,
                NoDevice: '',
              })),
            })),
          }),
        }),
      })));
    });

    test('throws if block devices without iops and wrong volume type', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const volumeSize = 50;
      const volumeType = EbsDeviceVolumeType.IO1;

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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

      // WHEN
      function createConfigureSpotEventPlugin() {
        new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
          vpc,
          renderQueue: renderQueue,
          spotFleets: [
            fleetWithCustomProps,
          ],
        });
      }

      // THEN
      expect(createConfigureSpotEventPlugin).toThrowError(/iops property is required with volumeType: EbsDeviceVolumeType.IO1/);
    });

    test('warning if block devices with iops and wrong volume type', () => {
      // GIVEN
      const deviceName = '/dev/xvda';
      const volumeSize = 50;
      const iops = 100;
      const volumeType = EbsDeviceVolumeType.STANDARD;

      const fleetWithCustomProps = new SpotEventPluginFleet(stack, 'SpotEventPluginFleet', {
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

      // WHEN
      const config = new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleetWithCustomProps,
        ],
      });

      // THEN
      expect(config.node.metadata[0].type).toMatch(ArtifactMetadataEntryType.WARN);
      expect(config.node.metadata[0].data).toMatch('iops will be ignored without volumeType: EbsDeviceVolumeType.IO1');
    });
  });

  test('only one object allowed per render queue', () => {
    // GIVEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      spotFleets: [
        fleet,
      ],
    });

    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
        vpc,
        renderQueue: renderQueue,
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
      spotFleets: [
        fleet,
      ],
    });

    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
      vpc,
      renderQueue: renderQueue2,
      spotFleets: [
        fleet,
      ],
    });

    // THEN
    cdkExpect(stack).to(countResources('Custom::RFDK_ConfigureSpotEventPlugin', 2));
  });

  test('throws with not supported render queue', () => {
    // GIVEN
    const invalidRenderQueue = {
    };

    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
        vpc,
        renderQueue: invalidRenderQueue as IRenderQueue,
        spotFleets: [
          fleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).toThrowError(/The provided render queue is not an instance of RenderQueue class. Some functionality is not supported./);
  });

  test('skipes subnets if fleet does not have any', () => {
    // GIVEN
    const mockedFleet = {
      ...fleet,
      subnets: {
        subnetIds: [],
      },
    } as unknown;

    // WHEN
    new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin2', {
      vpc,
      renderQueue,
      spotFleets: [
        mockedFleet as SpotEventPluginFleet,
      ],
    });

    // THEN
    cdkExpect(stack).notTo(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
      spotFleetRequestConfigurations: objectLike({
        [groupName]: objectLike({
          LaunchSpecifications: arrayWith(
            objectLike({
              SubnetId: objectLike({}),
            }),
          ),
        }),
      }),
    })));
  });

  test('tagSpecifications returns undefined if fleet does not have tags', () => {
    // GIVEN
    const mockFleet = {
      tags: {
        hasTags: jest.fn().mockReturnValue(false),
      },
    };
    const mockedFleet = (mockFleet as unknown) as SpotEventPluginFleet;
    const config = new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      spotFleets: [
        fleet,
      ],
    });

    // WHEN
    // eslint-disable-next-line dot-notation
    const result = stack.resolve(config['tagsSpecifications'](mockedFleet,  SpotFleetResourceType.INSTANCE));

    // THEN
    expect(result).toBeUndefined();
  });

  describe('with TLS', () => {
    let renderQueueWithTls: IRenderQueue;
    let caCert: X509CertificatePem;

    beforeEach(() => {
      const host = 'renderqueue';
      const zoneName = 'deadline-test.internal';

      caCert = new X509CertificatePem(stack, 'RootCA', {
        subject: {
          cn: 'SampleRootCA',
        },
      });

      renderQueueWithTls = new RenderQueue(stack, 'RQ with TLS', {
        vpc,
        images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
        repository: new Repository(stack, 'Repository2', {
          vpc,
          version,
        }),
        version,
        hostname: {
          zone: new PrivateHostedZone(stack, 'DnsZone', {
            vpc,
            zoneName: zoneName,
          }),
          hostname: host,
        },
        trafficEncryption: {
          externalTLS: {
            rfdkCertificate: new X509CertificatePem(stack, 'RQCert', {
              subject: {
                cn: `${host}.${zoneName}`,
              },
              signingCertificate: caCert,
            }),
          },
        },
      });
    });

    test('Lambda role can get the ca secret', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueueWithTls,
        spotFleets: [
          fleet,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              Effect: 'Allow',
              Resource: stack.resolve((renderQueueWithTls as RenderQueue).certChain!.secretArn),
            },
          ],
        },
        Roles: [
          {
            Ref: 'ConfigureSpotEventPluginConfiguratorServiceRole341B4735',
          },
        ],
      }));
    });

    test('creates a custom resource with connection', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueueWithTls,
        spotFleets: [
          fleet,
        ],
      });

      // THEN
      cdkExpect(stack).to(haveResourceLike('Custom::RFDK_ConfigureSpotEventPlugin', objectLike({
        connection: objectLike({
          hostname: stack.resolve(renderQueueWithTls.endpoint.hostname),
          port: '4433',
          protocol: 'HTTPS',
          caCertificateArn: stack.resolve((renderQueueWithTls as RenderQueue).certChain!.secretArn),
        }),
      })));
    });
  });

  test('throws with the same group name', () => {
    // WHEN
    function createConfigureSpotEventPlugin() {
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
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
      spotFleets: [
        fleet,
      ],
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'configure-spot-event-plugin.configureSEP',
      VpcConfig: {
        SubnetIds: [
          stack.resolve(vpc.privateSubnets[0].subnetId),
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
        spotFleets: [
          fleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).not.toThrow();
  });
});
