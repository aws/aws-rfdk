/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  Duration,
  Expiration,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  GenericWindowsImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { PrivateHostedZone } from 'aws-cdk-lib/aws-route53';
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
import { resourcePropertiesCountIs } from './test-helper';


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
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        spotPluginConfigurations: Match.objectLike({
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
      }));
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        spotPluginConfigurations: Match.objectLike({
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
      }));
    });

    test('without spot fleets', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', {
        spotFleetRequestConfigurations: Match.absent(),
      });
    });

    test('provides RQ connection parameters to custom resource', () => {
      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
        ],
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        connection: Match.objectLike({
          hostname: stack.resolve(renderQueue.endpoint.hostname),
          port: stack.resolve(renderQueue.endpoint.portAsString()),
          protocol: stack.resolve(renderQueue.endpoint.applicationProtocol.toString()),
        }),
      }));
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', {
        spotFleetRequestConfigurations: {
          [groupName]: {
            AllocationStrategy: 'lowestPrice',
            IamFleetRole: stack.resolve(fleet.fleetRole.roleArn),
            LaunchTemplateConfigs: Match.arrayWith([
              Match.objectLike({
                LaunchTemplateSpecification: {
                  Version: stack.resolve(fleet.launchTemplate.versionNumber),
                  LaunchTemplateId: stack.resolve(fleet.launchTemplate.launchTemplateId),
                },
              }),
            ]),
            TagSpecifications: Match.arrayWith([
              Match.objectLike({
                ResourceType: 'spot-fleet-request',
                Tags: Match.arrayWith([
                  {
                    Key: rfdkTag.name,
                    Value: rfdkTag.value,
                  },
                ]),
              }),
            ]),
          },
        },
      });
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
      resourcePropertiesCountIs(stack, 'AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginAdminPolicy').managedPolicyArn),
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAdminPolicy').managedPolicyArn),
        ]),
      }, 1);

      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
                stack.resolve(fleet.fleetRole.roleArn),
                stack.resolve(fleet.fleetInstanceRole.roleArn),
              ],
            },
            {
              Action: 'ec2:CreateTags',
              Effect: 'Allow',
              Resource: [
                'arn:aws:ec2:*:*:spot-fleet-request/*',
                'arn:aws:ec2:*:*:volume/*',
              ],
            },
          ],
        },
        Roles: [{
          Ref: 'RQRCSTaskTaskRole00DC9B43',
        }],
      });
    });

    test('adds resource tracker policy even if rt disabled', () => {
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
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAdminPolicy').managedPolicyArn),
        ]),
      });
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        spotFleetRequestConfigurations: Match.absent(),
      }));

      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', Match.not({
        ManagedPolicyArns: Match.arrayWith([
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginAdminPolicy').managedPolicyArn),
          stack.resolve(ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAdminPolicy').managedPolicyArn),
        ]),
      }));

      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', Match.not({
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
                stack.resolve(fleet.fleetRole.roleArn),
                stack.resolve(fleet.fleetInstanceRole.roleArn),
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        spotFleetRequestConfigurations: Match.objectLike({
          [groupName]: Match.objectLike({
            ValidUntil: validUntil.date.toISOString(),
          }),
        }),
      }));
    });

    test('fleet with context', () => {
      // GIVEN
      const context = 'context-abcdef';
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
        context,
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        spotFleetRequestConfigurations: Match.objectLike({
          [groupName]: Match.objectLike({
            Context: context,
          }),
        }),
      }));
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
    expect(createConfigureSpotEventPlugin).toThrow(/Only one ConfigureSpotEventPlugin construct is allowed per render queue./);
  });

  test('can create multiple objects with different render queues', () => {
    // GIVEN
    const renderQueue2 = new RenderQueue(stack, 'RQ2', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(stack, 'Repository2', {
        vpc,
        version,
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
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
    Template.fromStack(stack).resourceCountIs('Custom::RFDK_ConfigureSpotEventPlugin', 2);
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
    expect(createConfigureSpotEventPlugin).toThrow(/The provided render queue is not an instance of RenderQueue class. Some functionality is not supported./);
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
    const result = stack.resolve(config['tagSpecifications'](mockedFleet,  SpotFleetResourceType.INSTANCE));

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
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
      });
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
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_ConfigureSpotEventPlugin', Match.objectLike({
        connection: Match.objectLike({
          hostname: stack.resolve(renderQueueWithTls.endpoint.hostname),
          port: stack.resolve(renderQueueWithTls.endpoint.portAsString()),
          protocol: stack.resolve(renderQueueWithTls.endpoint.applicationProtocol.toString()),
          caCertificateArn: stack.resolve((renderQueueWithTls as RenderQueue).certChain!.secretArn),
        }),
      }));
    });
  });

  test('throws with the same group name', () => {
    // WHEN
    function createConfigureSpotEventPlugin() {
      const duplicateFleet = new SpotEventPluginFleet(stack, 'DuplicateSpotFleet', {
        vpc,
        renderQueue,
        workerMachineImage: fleet.machineImage,
        instanceTypes: fleet.instanceTypes,
        maxCapacity: fleet.maxCapacity,
        deadlineGroups: fleet.deadlineGroups,
      });
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        vpc,
        renderQueue: renderQueue,
        spotFleets: [
          fleet,
          duplicateFleet,
        ],
      });
    }

    // THEN
    expect(createConfigureSpotEventPlugin).toThrow(`Bad Group Name: ${groupName}. Group names in Spot Fleet Request Configurations should be unique.`);
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
    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'configure-spot-event-plugin.configureSEP',
      VpcConfig: {
        SubnetIds: [
          stack.resolve(vpc.privateSubnets[0].subnetId),
        ],
      },
    });
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
          secretsManagementSettings: { enabled: false },
        }),
        trafficEncryption: { externalTLS: { enabled: false } },
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
      expect(createConfigureSpotEventPlugin).toThrow(`Minimum supported Deadline version for ConfigureSpotEventPlugin is 10.1.12.0. Received: ${versionString}.`);
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
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
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

  describe('secrets management enabled', () => {
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
    });

    test('a fleet without vpcSubnets specified => warns about dedicated subnets', () => {
      // GIVEN
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

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        renderQueue,
        vpc,
        spotFleets: [fleet],
      });

      // THEN
      Annotations.fromStack(stack).hasWarning(
        `/${fleet.node.path}`,
        'Deadline Secrets Management is enabled on the Repository and VPC subnets have not been supplied. Using dedicated subnets is recommended. See https://github.com/aws/aws-rfdk/blobs/release/packages/aws-rfdk/lib/deadline/README.md#using-dedicated-subnets-for-deadline-components',
      );
    });

    test('a fleet with vpcSubnets specified => does not warn about dedicated subnets', () => {
      // GIVEN
      fleet = new SpotEventPluginFleet(stack, 'SpotFleetWithSubnets', {
        vpc,
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
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

      // WHEN
      new ConfigureSpotEventPlugin(stack, 'ConfigureSpotEventPlugin', {
        renderQueue,
        vpc,
        spotFleets: [fleet],
      });

      // THEN
      Annotations.fromStack(stack).hasNoWarning(`/${fleet.node.path}`, Match.stringLikeRegexp('.*dedicated subnet.*'));
    });
  });
});
