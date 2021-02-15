/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  BlockDevice,
  BlockDeviceVolume,
  EbsDeviceVolumeType,
} from '@aws-cdk/aws-autoscaling';
import {
  IVpc,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  Role,
  Policy,
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Code,
  Function as LambdaFunction,
  LayerVersion,
  Runtime,
} from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import {
  Annotations,
  Construct,
  CustomResource,
  Duration,
  Fn,
  IResolvable,
  Lazy,
  Stack,
} from '@aws-cdk/core';
import { ARNS } from '../../lambdas/lambdaLayerVersionArns';
import {
  PluginSettings,
  SEPConfiguratorResourceProps,
  LaunchSpecification,
  SpotFleetRequestConfiguration,
  SpotFleetRequestProps,
  SpotFleetSecurityGroupId,
  SpotFleetTagSpecification,
  BlockDeviceMappingProperty,
  BlockDeviceProperty,
} from '../../lambdas/nodejs/configure-spot-event-plugin';
import { IRenderQueue, RenderQueue } from './render-queue';
import { SpotEventPluginFleet } from './spot-event-plugin-fleet';
import {
  SpotFleetRequestType,
  SpotFleetResourceType,
} from './spot-event-plugin-fleet-ref';
import { Version } from './version';

/**
 * How the event plug-in should respond to events.
 */
export enum SpotEventPluginState {
  /**
   * The Render Queue, all jobs and Workers will trigger the events for this plugin.
   */
  GLOBAL_ENABLED = 'Global Enabled',

  /**
   * No events are triggered for the plugin.
   */
  DISABLED = 'Disabled',
}

/**
 * Logging verbosity levels for the Spot Event Plugin.
 */
export enum SpotEventPluginLoggingLevel {
  /**
   * Standard logging level.
   */
  STANDARD = 'Standard',

  /**
   * Detailed logging about the inner workings of the Spot Event Plugin.
   */
  VERBOSE = 'Verbose',

  /**
   * All Verbose logs plus additional information on AWS API calls that are used.
   */
  DEBUG = 'Debug',

  /**
   * No logging enabled.
   */
  OFF = 'Off',
}

/**
 * How the Spot Event Plugin should handle Pre Job Tasks.
 * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/job-scripts.html
 */
export enum SpotEventPluginPreJobTaskMode {
  /**
   * Only start 1 Spot instance for the pre job task and ignore any other tasks for that job until the pre job task is completed.
   */
  CONSERVATIVE = 'Conservative',

  /**
   * Do not take the pre job task into account when calculating target capacity.
   */
  IGNORE = 'Ignore',

  /**
   * Treat the pre job task like a regular job queued task.
   */
  NORMAL = 'Normal',
}

/**
 * The Worker Extra Info column to be used to display AWS Instance Status
 * if the instance has been marked to be stopped or terminated by EC2 or Spot Event Plugin.
 * See "AWS Instance Status" option at https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options
 * and https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/worker-config.html#extra-info
 */
export enum SpotEventPluginDisplayInstanceStatus {
  DISABLED = 'Disabled',
  EXTRA_INFO_0 = 'ExtraInfo0',
  EXTRA_INFO_1 = 'ExtraInfo0',
  EXTRA_INFO_2 = 'ExtraInfo0',
  EXTRA_INFO_3 = 'ExtraInfo0',
  EXTRA_INFO_4 = 'ExtraInfo0',
  EXTRA_INFO_5 = 'ExtraInfo0',
  EXTRA_INFO_6 = 'ExtraInfo0',
  EXTRA_INFO_7 = 'ExtraInfo0',
  EXTRA_INFO_8 = 'ExtraInfo0',
  EXTRA_INFO_9 = 'ExtraInfo0',
}

/**
 * The settings of the Spot Event Plugin.
 * For more details see https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options
 */
export interface SpotEventPluginSettings {
  /**
   * How the event plug-in should respond to events.
   *
   * @default SpotEventPluginState.GLOBAL_ENABLED
   */
  readonly state?: SpotEventPluginState;

  /**
   * Determines whether the Deadline Resource Tracker should be used.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/resource-tracker-overview.html
   *
   * @default true
   */
  readonly enableResourceTracker?: boolean;

  /**
   * Spot Event Plugin logging level.
   * Note that Spot Event Plugin adds output to the logs of the render queue and the Workers.
   *
   * @default SpotEventPluginLoggingLevel.STANDARD
   */
  readonly loggingLevel?: SpotEventPluginLoggingLevel;

  /**
   * The AWS region in which to start the spot fleet request.
   *
   * @default The region of the Render Queue if it is available; otherwise the region of the current stack.
   */
  readonly region?: string;

  /**
   * The length of time that an AWS Worker will wait in a non-rendering state before it is shutdown.
   * Should evenly divide into minutes.
   *
   * @default Duration.minutes(10)
   */
  readonly idleShutdown?: Duration;

  /**
   * Determines if Deadline Spot Event Plugin terminated AWS Workers will be deleted from the Workers Panel on the next House Cleaning cycle.
   *
   * @default false
   */
  readonly deleteSEPTerminatedWorkers?: boolean;

  /**
   * Determines if EC2 Spot interrupted AWS Workers will be deleted from the Workers Panel on the next House Cleaning cycle.
   *
   * @default false
   */
  readonly deleteEC2SpotInterruptedWorkers?: boolean;

  /**
   * Determines if any active instances greater than the target capacity for each group will be terminated.
   * Workers may be terminated even while rendering.
   *
   * @default false
   */
  readonly strictHardCap?: boolean;

  /**
   * The Spot Event Plugin will request this maximum number of instances per House Cleaning cycle.
   *
   * @default 50
   */
  readonly maximumInstancesStartedPerCycle?: number;

  /**
   * Determines how the Spot Event Plugin should handle Pre Job Tasks.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/job-scripts.html
   *
   * @default SpotEventPluginPreJobTaskMode.CONSERVATIVE
   */
  readonly preJobTaskMode?: SpotEventPluginPreJobTaskMode;

  /**
   * The Worker Extra Info column to be used to display AWS Instance Status
   * if the instance has been marked to be stopped or terminated by EC2 or Spot Event Plugin.
   * All timestamps are displayed in UTC format.
   *
   * @default SpotEventPluginDisplayInstanceStatus.DISABLED
   */
  readonly awsInstanceStatus?: SpotEventPluginDisplayInstanceStatus;
}

/**
 *  Connection options used if render queue has TLS enabled.
 */
export interface ConfigureSpotEventPluginTrafficEncryptionProps {
  /**
   * The certificate used to sign the the chain of trust used for render queue.
   */
  readonly caCert: ISecret;
}

/**
 * Input properties for ConfigureSpotEventPlugin.
 */
export interface ConfigureSpotEventPluginProps {
  /**
   * The VPC in which to create the network endpoint for the lambda function that is
   * created by this construct.
   */
  readonly vpc: IVpc;

  /**
   * The RenderQueue that Worker fleet should connect to.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * Where within the VPC to place the lambda function's endpoint.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Connection options if the network traffic to the RenderQueue should is encrypted.
   */
  readonly trafficEncryption?: ConfigureSpotEventPluginTrafficEncryptionProps;

  /**
   * The array of Spot Event Plugin spot fleets used to generate the mapping between groups and spot fleet requests.
   *
   * @default Spot Fleet Request Configurations will not be updated.
   */
  readonly spotFleets?: SpotEventPluginFleet[];

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html?highlight=spot%20even%20plugin#event-plugin-configuration-options
   *
   * @default Default values of SpotEventPluginSettings will be set.
   */
  readonly configuration?: SpotEventPluginSettings;
}

/**
 * This construct configures the Deadline Spot Event Plugin to deploy and auto-scale one or more spot fleets.
 *
 * For example, to configure the Spot Event Plugin with one spot fleet:
 *
 * ```ts
 * import { App, Stack, Vpc } from '@aws-rfdk/core';
 * import { InstanceClass, InstanceSize, InstanceType } from '@aws-cdk/aws-ec2';
 * import { AwsThinkboxEulaAcceptance, ConfigureSpotEventPlugin, RenderQueue, Repository, SpotEventPluginFleet, ThinkboxDockerImages, VersionQuery } from '@aws-rfdk/deadline';
 * const app = new App();
 * const stack = new Stack(app, 'Stack');
 * const vpc = new Vpc(stack, 'Vpc');
 * const version = new VersionQuery(stack, 'Version', {
 *   version: '10.1.12',
 * });
 * const images = new ThinkboxDockerImages(stack, 'Image', {
 *   version,
 *   // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
 *   // of the AWS Thinkbox End User License Agreement
 *   userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
 * });
 * const repository = new Repository(stack, 'Repository', {
 *   vpc,
 *   version,
 * });
 * const renderQueue = new RenderQueue(stack, 'RenderQueue', {
 *   vpc,
 *   images: images.forRenderQueue(),
 *   repository: repository,
 * });
 *
 * const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
 *   vpc,
 *   renderQueue,
 *   deadlineGroups: ['group_name'],
 *   instanceTypes: [InstanceType.of(InstanceClass.T3, InstanceSize.LARGE)],
 *   workerMachineImage: new GenericLinuxImage({'us-west-2': 'ami-039f0c1faba28b015'}),
 *   naxCapacity: 1,
 * });
 *
 * const spotEventPluginConfig = new ConfigureSpotEventPlugin(this, 'ConfigureSpotEventPlugin', {
 *   vpc,
 *   renderQueue: renderQueue,
 *   spotFleets: [fleet],
 *   configuration: {
 *     enableResourceTracker: true,
 *   },
 * });
 * ```
 *
 * To provide this functionality, this construct will create an AWS Lambda function that is granted the ability
 * to connect to the render queue. This lambda is run automatically when you deploy or update the stack containing this construct.
 * Logs for all AWS Lambdas are automatically recorded in Amazon CloudWatch.
 *
 * This construct will configure the Spot Event Plugin, but the Spot Fleet Requests will not be created unless you:
 * - Create the Deadline Group associated with the Spot Fleet Request Configuration.
 * - Create the Deadline Pools to which the fleet Workers are added.
 * - Submit the job with the assigned Deadline Group and Deadline Pool.
 *
 *  Note that this construct adds additional policies to the Render Queue's role
 *  required to run the Spot Event Plugin and launch a Resource Tracker:
 *   - AWSThinkboxDeadlineSpotEventPluginAdminPolicy
 *   - AWSThinkboxDeadlineResourceTrackerAdminPolicy
 *   - A policy to pass a fleet and instance role
 *   - A policy to create tags for spot fleet requests
 *
 * Resources Deployed
 * ------------------------
 * - An AWS Lambda that is used to connect to the render queue, and save Spot Event Plugin configurations.
 * - A CloudFormation Custom Resource that triggers execution of the Lambda on stack deployment, update, and deletion.
 * - An Amazon CloudWatch log group that records history of the AWS Lambda's execution.
 * - An IAM Policy attached to Render Queue's Role.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The AWS Lambda function that is created by this resource has access to both the certificates used to connect to the render queue,
 *   and the render queue port. An attacker that can find a way to modify and execute this lambda could use it to
 *   execute any requets against the render queue. You should not grant any additional actors/principals the ability to modify
 *   or execute this Lambda.
 */
export class ConfigureSpotEventPlugin extends Construct {

  /**
   * Only one Spot Event Plugin Configuration is allowed per render queue / repository.
   */
  private static uniqueRenderQueues: Set<IRenderQueue> = new Set<IRenderQueue>();

  constructor(scope: Construct, id: string, props: ConfigureSpotEventPluginProps) {
    super(scope, id);

    if (ConfigureSpotEventPlugin.uniqueRenderQueues.has(props.renderQueue)) {
      throw new Error('Only one ConfigureSpotEventPlugin construct is allowed per render queue.');
    }
    else {
      ConfigureSpotEventPlugin.uniqueRenderQueues.add(props.renderQueue);
    }

    if (props.renderQueue instanceof RenderQueue) {
      // We do not check the patch version, so it's set to 0.
      const minimumVersion: Version = new Version([10, 1, 12, 0]);

      if (props.renderQueue.version.isLessThan(minimumVersion)) {
        throw new Error(`Minimum supported Deadline version for ${this.constructor.name} is ` +
        `${minimumVersion.versionString}. ` +
        `Received: ${props.renderQueue.version.versionString}.`);
      }

      if (props.spotFleets && props.spotFleets.length !== 0) {
        props.renderQueue.addSEPPolicies(props.configuration?.enableResourceTracker ?? true);

        const fleetRoles = props.spotFleets.map(sf => sf.fleetRole.roleArn);
        const fleetInstanceRoles = props.spotFleets.map(sf => sf.fleetInstanceRole.roleArn);
        new Policy(this, 'SpotEventPluginPolicy', {
          statements: [
            new PolicyStatement({
              actions: [
                'iam:PassRole',
              ],
              resources: [...fleetRoles, ...fleetInstanceRoles],
              conditions: {
                StringLike: {
                  'iam:PassedToService': 'ec2.amazonaws.com',
                },
              },
            }),
            new PolicyStatement({
              actions: [
                'ec2:CreateTags',
              ],
              resources: ['arn:aws:ec2:*:*:spot-fleet-request/*'],
            }),
          ],
          roles: [
            props.renderQueue.grantPrincipal as Role,
          ],
        });
      }
    }
    else {
      throw new Error('The provided render queue is not an instance of RenderQueue class. Some functionality is not supported.');
    }

    const region = Construct.isConstruct(props.renderQueue) ? Stack.of(props.renderQueue).region : Stack.of(this).region;
    const openSslLayerArns: any = ARNS['openssl-al2'];
    const openSslLayer = LayerVersion.fromLayerVersionArn(this, 'OpenSslLayer', openSslLayerArns[region]);

    const configurator = new LambdaFunction(this, 'Configurator', {
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
      description: `Used by a ConfigureSpotEventPlugin ${this.node.addr} to perform configuration of Deadline Spot Event Plugin`,
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'), {
      }),
      environment: {
        DEBUG: 'false',
      },
      runtime: Runtime.NODEJS_12_X,
      handler: 'configure-spot-event-plugin.configureSEP',
      layers: [ openSslLayer ],
      timeout: Duration.minutes(2),
      logRetention: RetentionDays.ONE_WEEK,
    });

    configurator.connections.allowToDefaultPort(props.renderQueue);
    props.trafficEncryption?.caCert.grantRead(configurator.grantPrincipal);

    const pluginConfig: PluginSettings = {
      AWSInstanceStatus: props.configuration?.awsInstanceStatus ?? SpotEventPluginDisplayInstanceStatus.DISABLED,
      DeleteInterruptedSlaves: props.configuration?.deleteEC2SpotInterruptedWorkers ?? false,
      DeleteTerminatedSlaves: props.configuration?.deleteSEPTerminatedWorkers ?? false,
      IdleShutdown: props.configuration?.idleShutdown?.toMinutes({integral: true}) ?? 10,
      Logging: props.configuration?.loggingLevel ?? SpotEventPluginLoggingLevel.STANDARD,
      PreJobTaskMode: props.configuration?.preJobTaskMode ?? SpotEventPluginPreJobTaskMode.CONSERVATIVE,
      Region: props.configuration?.region ?? region,
      ResourceTracker: props.configuration?.enableResourceTracker ?? true,
      StaggerInstances: props.configuration?.maximumInstancesStartedPerCycle ?? 50,
      State: props.configuration?.state ?? SpotEventPluginState.GLOBAL_ENABLED,
      StrictHardCap: props.configuration?.strictHardCap ?? false,
    };
    const spotFleetRequestConfigs = this.mergeSpotFleetRequestConfigs(props.spotFleets);

    const properties: SEPConfiguratorResourceProps = {
      connection: {
        hostname: props.renderQueue.endpoint.hostname,
        port: props.renderQueue.endpoint.portAsString(),
        protocol: props.renderQueue.endpoint.applicationProtocol,
        caCertificateArn: props.trafficEncryption?.caCert?.secretArn,
      },
      spotFleetRequestConfigurations: spotFleetRequestConfigs,
      spotPluginConfigurations: pluginConfig,
    };

    const resource = new CustomResource(this, 'Default', {
      serviceToken: configurator.functionArn,
      resourceType: 'Custom::RFDK_ConfigureSpotEventPlugin',
      properties,
    });
    // Prevents a race during a stack-update.
    resource.node.addDependency(configurator.role!);

    // /* istanbul ignore next */
    // Add a dependency on the render queue to ensure that
    // it is running before we try to send requests to it.
    resource.node.addDependency(props.renderQueue);

    this.node.defaultChild = resource;
  }

  private tagsSpecifications(fleet: SpotEventPluginFleet, resourceType: SpotFleetResourceType): IResolvable {
    return Lazy.any({
      produce: () => {
        if (fleet.tags.hasTags()) {
          const tagSpecification: SpotFleetTagSpecification = {
            ResourceType: resourceType,
            Tags: fleet.tags.renderTags(),
          };
          return [tagSpecification];
        }
        return undefined;
      },
    });
  }

  /**
   * Construct Spot Fleet Configurations from the provided fleet.
   * Each congiguration is a mapping between one Deadline Group and one Spot Fleet Request Configuration.
   */
  private generateSpotFleetRequestConfig(fleet: SpotEventPluginFleet): SpotFleetRequestConfiguration[] {
    const securityGroupsToken = Lazy.any({ produce: () => {
      return fleet.securityGroups.map(sg => {
        const securityGroupId: SpotFleetSecurityGroupId = {
          GroupId: sg.securityGroupId,
        };
        return securityGroupId;
      });
    }});

    const userDataToken = Lazy.string({ produce: () => Fn.base64(fleet.userData.render()) });

    const blockDeviceMappings = (fleet.blockDevices !== undefined ?
      this.synthesizeBlockDeviceMappings(fleet.blockDevices) : undefined);

    const { subnetIds } = fleet.subnets;
    const subnetId = subnetIds.length != 0 ? subnetIds.join(',') : undefined;

    const instanceTagsToken = this.tagsSpecifications(fleet, SpotFleetResourceType.INSTANCE);
    const spotFleetRequestTagsToken = this.tagsSpecifications(fleet, SpotFleetResourceType.SPOT_FLEET_REQUEST);

    const launchSpecifications: LaunchSpecification[] = [];

    fleet.instanceTypes.map(instanceType => {
      const launchSpecification: LaunchSpecification = {
        BlockDeviceMappings: blockDeviceMappings,
        IamInstanceProfile: {
          Arn: fleet.instanceProfile.attrArn,
        },
        ImageId: fleet.imageId,
        KeyName: fleet.keyName,
        // Need to convert from IResolvable to bypass TypeScript
        SecurityGroups: (securityGroupsToken  as unknown) as SpotFleetSecurityGroupId[],
        SubnetId: subnetId,
        // Need to convert from IResolvable to bypass TypeScript
        TagSpecifications: (instanceTagsToken as unknown) as SpotFleetTagSpecification[],
        UserData: userDataToken,
        InstanceType: instanceType.toString(),
      };
      launchSpecifications.push(launchSpecification);
    });

    const spotFleetRequestProps: SpotFleetRequestProps = {
      AllocationStrategy: fleet.allocationStrategy,
      IamFleetRole: fleet.fleetRole.roleArn,
      LaunchSpecifications: launchSpecifications,
      ReplaceUnhealthyInstances: true,
      // In order to work with Deadline, the 'Target Capacity' of the Spot fleet Request is
      // the maximum number of Workers that Deadline will start.
      TargetCapacity: fleet.maxCapacity,
      TerminateInstancesWithExpiration: true,
      // In order to work with Deadline, Spot Fleets Requests must be set to maintain.
      Type: SpotFleetRequestType.MAINTAIN,
      ValidUntil: fleet.validUntil ? fleet.validUntil?.date.toUTCString() : undefined,
      // Need to convert from IResolvable to bypass TypeScript
      TagSpecifications: (spotFleetRequestTagsToken as unknown) as SpotFleetTagSpecification[],
    };

    const spotFleetRequestConfigurations = fleet.deadlineGroups.map(group => {
      const spotFleetRequestConfiguration: SpotFleetRequestConfiguration = {
        [group]: spotFleetRequestProps,
      };
      return spotFleetRequestConfiguration;
    });

    return spotFleetRequestConfigurations;
  }

  /**
   * Synthesize an array of block device mappings from a list of block devices
   *
   * @param blockDevices list of block devices
   */
  private synthesizeBlockDeviceMappings(blockDevices: BlockDevice[]): BlockDeviceMappingProperty[] {
    return blockDevices.map(({ deviceName, volume, mappingEnabled }) => {
      const { virtualName, ebsDevice: ebs } = volume;

      if (volume === BlockDeviceVolume._NO_DEVICE || mappingEnabled === false) {
        return {
          DeviceName: deviceName,
          // To omit the device from the block device mapping, specify an empty string.
          // See https://docs.aws.amazon.com/cli/latest/reference/ec2/request-spot-fleet.html
          NoDevice: '',
        };
      }

      let Ebs: BlockDeviceProperty | undefined;

      if (ebs) {
        const { iops, volumeType, volumeSize, snapshotId, deleteOnTermination } = ebs;

        if (!iops) {
          if (volumeType === EbsDeviceVolumeType.IO1) {
            throw new Error('iops property is required with volumeType: EbsDeviceVolumeType.IO1');
          }
        } else if (volumeType !== EbsDeviceVolumeType.IO1) {
          Annotations.of(this).addWarning('iops will be ignored without volumeType: EbsDeviceVolumeType.IO1');
        }

        Ebs = {
          DeleteOnTermination: deleteOnTermination,
          Iops: iops,
          SnapshotId: snapshotId,
          VolumeSize: volumeSize,
          VolumeType: volumeType,
          // encrypted is not exposed as part of ebsDeviceProps so we need to access it via [].
          // eslint-disable-next-line dot-notation
          Encrypted: 'encrypted' in ebs ? ebs['encrypted'] : undefined,
        };
      }

      return {
        DeviceName: deviceName,
        Ebs,
        VirtualName: virtualName,
      };
    });
  }

  private mergeSpotFleetRequestConfigs(spotFleets?: SpotEventPluginFleet[]): SpotFleetRequestConfiguration | undefined {
    if (!spotFleets || spotFleets.length === 0) {
      return undefined;
    }

    const fullSpotFleetRequestConfiguration: SpotFleetRequestConfiguration = {};
    spotFleets.map(fleet => {
      const spotFleetRequestConfigurations = this.generateSpotFleetRequestConfig(fleet);
      spotFleetRequestConfigurations.map(configuration => {
        for (const [key, value] of Object.entries(configuration)) {
          if (key in fullSpotFleetRequestConfiguration) {
            throw new Error(`Bad Group Name: ${key}. Group names in Spot Fleet Request Configurations should be unique.`);
          }
          fullSpotFleetRequestConfiguration[key] = value;
        }
      });
    });

    return fullSpotFleetRequestConfiguration;
  }
}
