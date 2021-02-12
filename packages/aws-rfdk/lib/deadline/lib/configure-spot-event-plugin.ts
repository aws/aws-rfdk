/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

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
  Construct,
  CustomResource,
  Duration,
  Stack,
} from '@aws-cdk/core';
import { ARNS } from '../../lambdas/lambdaLayerVersionArns';
import {
  InternalSpotEventPluginSettings,
  SEPConfiguratorResourceProps,
} from '../../lambdas/nodejs/configure-spot-event-plugin';
import { IRenderQueue, RenderQueue } from './render-queue';
import { SpotEventPluginFleet } from './spot-event-plugin-fleet';
import { SpotFleetRequestConfiguration} from './spot-event-plugin-fleet-ref';
import { Version } from './version';
import { IVersion } from './version-ref';

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
export enum SpotEventPluginAwsInstanceStatus {
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
   * @default SpotEventPluginState.DISABLED
   */
  readonly state?: SpotEventPluginState;

  /**
   * Determines whether Deadline Resource Tracker should be used.
   * Only disable for AMIs with Deadline 10.0.26 or earlier.
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
   * Warning: The terminated Worker's reports will also be deleted for each Worker, which may be undesired for future debugging of a render job issue.
   *
   * @default false
   */
  readonly deleteSEPTerminatedWorkers?: boolean;

  /**
   * Determines if EC2 Spot interrupted AWS Workers will be deleted from the Workers Panel on the next House Cleaning cycle.
   * Warning: The terminated Worker's reports will also be deleted for each Worker, which may be undesired for future debugging of a render job issue.
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
   * The Spot Plugin will request this maximum number of instances per House Cleaning cycle.
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
   * @default SpotEventPluginAwsInstanceStatus.DISABLED
   */
  readonly awsInstanceStatus?: SpotEventPluginAwsInstanceStatus;
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
   * The Deadline Client version that will be running within the Render Queue.
   */
  readonly version: IVersion;

  /**
   * Where within the VPC to place the lambda function's endpoint.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The certificate used to sign the the chain of trust used for render queue. Only used if render queue has TLS enabled.
   */
  readonly caCert?: ISecret;

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
   * @default Spot Event Plugin settings will not be updated.
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
 *   version: recipes.version,
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
 *   version: recipes.version,
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
 * Note that this construct will configure the Spot Event Plugin, but the Spot Fleet Requests will not be created unless you:
 * - Create the Deadline Group associated with the Spot Fleet Request Configuration.
 * - Create the Deadline Pools to which the fleet Workers are added.
 * - Submit the job with the assigned Deadline Group and Deadline Pool.
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
 *   to run the Spot Event Plugin and launch a Resource Tracker:
 *   - AWSThinkboxDeadlineSpotEventPluginAdminPolicy
 *   - AWSThinkboxDeadlineResourceTrackerAdminPolicy
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
        `Received: ${props.version.versionString}.`);
      }

      props.renderQueue.addSEPPolicies();

      const fleetRoles = props.spotFleets?.map(sf => sf.fleetRole.roleArn) || [];
      const fleetInstanceRoles = props.spotFleets?.map(sf => sf.fleetInstanceRole.roleArn) || [];
      const roles = [...fleetRoles, ...fleetInstanceRoles];
      new Policy(this, 'SpotFleetPassRolePolicy', {
        statements: [
          new PolicyStatement({
            actions: [
              'iam:PassRole',
            ],
            resources: roles.length !== 0 ? roles : undefined,
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
    props.caCert?.grantRead(configurator.grantPrincipal);

    const pluginConfig: InternalSpotEventPluginSettings = {
      AWSInstanceStatus: props.configuration?.awsInstanceStatus ?? SpotEventPluginAwsInstanceStatus.DISABLED,
      DeleteInterruptedSlaves: props.configuration?.deleteEC2SpotInterruptedWorkers ?? false,
      DeleteTerminatedSlaves: props.configuration?.deleteSEPTerminatedWorkers ?? false,
      IdleShutdown: props.configuration?.idleShutdown?.toMinutes({integral: true}) ?? 10,
      Logging: props.configuration?.loggingLevel ?? SpotEventPluginLoggingLevel.STANDARD,
      PreJobTaskMode: props.configuration?.preJobTaskMode ?? SpotEventPluginPreJobTaskMode.CONSERVATIVE,
      Region: props.configuration?.region ?? region,
      ResourceTracker: props.configuration?.enableResourceTracker ?? true,
      StaggerInstances: props.configuration?.maximumInstancesStartedPerCycle ?? 50,
      State: props.configuration?.state ?? SpotEventPluginState.DISABLED,
      StrictHardCap: props.configuration?.strictHardCap ?? false,
    };
    const spotFleetRequestConfigs = this.mergeSpotFleetRequestConfigs(props.spotFleets);

    const properties: SEPConfiguratorResourceProps = {
      connection: {
        hostname: props.renderQueue.endpoint.hostname,
        port: props.renderQueue.endpoint.portAsString(),
        protocol: props.renderQueue.endpoint.applicationProtocol,
        caCertificateArn: props.caCert?.secretArn,
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

  private mergeSpotFleetRequestConfigs(spotFleets?: SpotEventPluginFleet[]): SpotFleetRequestConfiguration | undefined {
    if (!spotFleets || spotFleets.length === 0) {
      return undefined;
    }

    const fullSpotFleetRequestConfiguration: SpotFleetRequestConfiguration = {};
    spotFleets.map(fleet => {
      fleet.spotFleetRequestConfigurations.map(configuration => {
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
