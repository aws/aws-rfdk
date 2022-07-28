/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  Duration,
} from 'aws-cdk-lib';
import {
  OperatingSystemType,
} from 'aws-cdk-lib/aws-ec2';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import {
  CloudWatchAgent,
  CloudWatchConfigBuilder,
  LogGroupFactory,
  LogGroupFactoryProps,
  ScriptAsset,
} from '../../core';
import {
  IHost,
} from './host-ref';
import {
  IRenderQueue,
} from './render-queue';
import {
  Version,
} from './version';

/**
 * Provider for adding user data scripts
 * Methods of this interface will be invoked in WorkerInstanceConfiguration
 * on different stages of worker configuration
 */
export interface IInstanceUserDataProvider {
  /**
   * Method that is invoked before configuring the Cloud Watch Agent.
   */
  preCloudWatchAgent(host: IHost): void;

  /**
   * Method that is invoked before the render queue configuration.
   */
  preRenderQueueConfiguration(host: IHost): void;

  /**
   * Method that is invoked after configuring the connection to the render queue and before configuring the Deadline Worker.
   */
  preWorkerConfiguration(host: IHost): void;

  /**
   * Method that is invoked after all configuration is done and worker started.
   */
  postWorkerLaunch(host: IHost): void;
}

/**
 * Implementation of {@link IInstanceUserDataProvider}.
 * Can be used as sub-class with override the desired methods
 * to add custom user data commands for WorkerInstanceFleet or WorkerInstanceConfiguration.
 */
export class InstanceUserDataProvider extends Construct  implements IInstanceUserDataProvider{
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  /**
   * @inheritdoc
   */
  preCloudWatchAgent(_host: IHost): void {
  }

  /**
   * @inheritdoc
   */
  preRenderQueueConfiguration(_host: IHost): void {
  }

  /**
   * @inheritdoc
   */
  preWorkerConfiguration(_host: IHost): void {
  }

  /**
   * @inheritdoc
   */
  postWorkerLaunch(_host: IHost): void {
  }
}
/**
 * Configuration settings for Deadline Workers
 */
export interface WorkerSettings {
  /**
   * Deadline groups these workers needs to be assigned to. The group is
   * created if it does not already exist.
   *
   * @default - Worker is not assigned to any group
   */
  readonly groups?: string[];

  /**
   * Deadline pools these workers needs to be assigned to. The pool is created
   * if it does not already exist.
   *
   * @default - Worker is not assigned to any pool.
   */
  readonly pools?: string[];

  /**
   * Deadline region these workers needs to be assigned to.
   *
   * @default - Worker is not assigned to any region
   */
  readonly region?: string;

  /**
   * The port to configure the worker to listen on for remote commands such as
   * requests for its log stream. If more than one worker is present on a single
   * host, connsecutive ports will be opened, starting with the supplied port,
   * up to the maximum number of workers defined by the WorkerInstanceFleet.
   *
   * @default 56032
   */
  readonly listenerPort?: number;
}

/**
 * Properties for a WorkerInstanceConfiguration
 */
export interface WorkerInstanceConfigurationProps {
  /**
   * The Deadline Worker that should be configured.
   */
  readonly worker: IHost;

  /**
   * The RenderQueue that the worker should be configured to connect to
   *
   * @default The Worker is not configured to connect to a RenderQueue
   */
  readonly renderQueue?: IRenderQueue;

  /**
   * The configuration for streaming the Deadline Worker logs to AWS CloudWatch.
   *
   * @default The Worker logs will not be streamed to CloudWatch.
   */
  readonly cloudWatchLogSettings?: LogGroupFactoryProps;

  /**
   * Whether or not the CloudWatch agent should be automatically installed onto all worker instances.
   * This installation will be a best effort, but will not fail the deployment if it isn't completed
   * successfully. Ideally the CloudWatch agent should be installed on the AMI to avoid issues. If
   * the installation fails, logs will not be streamed off of the workers into CloudWatch.
   *
   * @default true
   */
  readonly shouldInstallCloudWatchAgent?: boolean;

  /**
   * The settings to apply to the Deadline Worker.
   *
   * @default The Worker is assigned the default settings as outlined in the WorkerSettings interface.
   */
  readonly workerSettings?: WorkerSettings;

  /**
   * An optional provider of user data commands to be injected at various points during the Worker configuration lifecycle.
   * You can provide a subclass of InstanceUserDataProvider with the methods overridden as desired.
   */
  readonly userDataProvider?: IInstanceUserDataProvider;
}

/**
 * This construct can be used to configure Deadline Workers on an instance to connect to a RenderQueue, stream their
 * log files to CloudWatch, and configure various settings of the Deadline Worker.
 *
 * The configuration happens on instance start-up using user data scripting.
 *
 * This configuration performs the following steps in order:
 * 1) Configure Cloud Watch Agent
 * 2) Configure Deadline Worker RenderQueue connection
 * 3) Configure Deadline Worker settings
 *
 * A `userDataProvider` can be specified that defines callback functions.
 * These callbacks can be used to inject user data commands at different points during the Worker instance configuration.
 *
 * Security Considerations
 * ------------------------
 * - The instances configured by this construct will download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 */
export class WorkerInstanceConfiguration extends Construct {
  /**
   * The default port to use for a worker to listen on for remote commands.
   */
  private static readonly DEFAULT_LISTENER_PORT = 56032;

  /**
   * @inheritdoc
   */
  public readonly listenerPort: number;

  constructor(scope: Construct, id: string, props: WorkerInstanceConfigurationProps) {
    super(scope, id);
    props.userDataProvider?.preCloudWatchAgent(props.worker);
    if (props.cloudWatchLogSettings) {
      this.configureCloudWatchLogStream(
        props.worker,
        id,
        props.cloudWatchLogSettings,
        props.shouldInstallCloudWatchAgent,
      );
    }
    props.userDataProvider?.preRenderQueueConfiguration(props.worker);
    props.renderQueue?.configureClientInstance({
      host: props.worker,
      // Don't restart the Deadline Launcher service after configuring the connection to the Render Queue. We need to
      // restart it later anyways, and the Windows service for the Deadline Launcher can get locked in the "stopping"
      // state if you attempt to stop or restart it while it is still restarting. This can cause the user data execution
      // to get locked waiting for the service to finish stopping/restarting.
      restartLauncher: false,
    });
    props.userDataProvider?.preWorkerConfiguration(props.worker);

    this.listenerPort = props.workerSettings?.listenerPort ?? WorkerInstanceConfiguration.DEFAULT_LISTENER_PORT;
    this.configureWorkerSettings(props.worker, id, props.workerSettings);

    props.userDataProvider?.postWorkerLaunch(props.worker);
  }

  /**
   * This method can be used to configure a Deadline Worker instance to stream its logs to the AWS CloudWatch
   * service. The logs that this configures to stream are:
   * - EC2 Instance UserData execution; this is the startup scripting that is run when the instance launches
   *   for the first time.
   * - Deadline Worker logs.
   * - Deadline Launcher logs.
   *
   * @param worker The worker to configure. This can be an instance, auto scaling group, launch template, etc.
   * @param id Identifier to disambiguate the resources that are created.
   * @param shouldInstallAgent Boolean for if the worker's User Data should attempt to install the CloudWatch agent
   * @param logGroupProps Configuration for the log group in CloudWatch.
   */
  protected configureCloudWatchLogStream(
    worker: IHost,
    id: string,
    logGroupProps: LogGroupFactoryProps,
    shouldInstallAgent?: boolean,
  ): void {
    const logGroup = LogGroupFactory.createOrFetch(this, `${id}LogGroupWrapper`, id, logGroupProps);

    logGroup.grantWrite(worker);

    const cloudWatchConfigurationBuilder = new CloudWatchConfigBuilder(Duration.seconds(15));

    if (worker.osType === OperatingSystemType.WINDOWS) {
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'UserdataExecution',
        'C:\\ProgramData\\Amazon\\EC2-Windows\\Launch\\Log\\UserdataExecution.log');
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'WorkerLogs',
        'C:\\ProgramData\\Thinkbox\\Deadline10\\logs\\deadlineslave*.log');
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'LauncherLogs',
        'C:\\ProgramData\\Thinkbox\\Deadline10\\logs\\deadlinelauncher*.log');
    } else {
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'cloud-init-output',
        '/var/log/cloud-init-output.log');
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'WorkerLogs',
        '/var/log/Thinkbox/Deadline10/deadlineslave*.log');
      cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
        'LauncherLogs',
        '/var/log/Thinkbox/Deadline10/deadlinelauncher*.log');
    }

    new CloudWatchAgent(this, `${id}LogsConfig`, {
      cloudWatchConfig: cloudWatchConfigurationBuilder.generateCloudWatchConfiguration(),
      host: worker,
      shouldInstallAgent,
    });
  }

  /**
   * This method can be used to set up the Deadline Worker application on an EC2 instance. From a practical
   * perspective, this is executing the script found in aws-rfdk/lib/deadline/scripts/[bash,powershell]/configureWorker.[sh,ps1]
   * to configure the Deadline Worker application.
   *
   * @param worker The worker to configure. This can be an instance, auto scaling group, launch template, etc.
   * @param id Identifier to disambiguate the resources that are created.
   * @param settings The Deadline Worker settings to apply.
   */
  protected configureWorkerSettings(worker: IHost, id: string, settings?: WorkerSettings): void {
    const configureWorkerScriptAsset = ScriptAsset.fromPathConvention(this, `${id}ConfigScript`, {
      osType: worker.osType,
      baseName: 'configureWorker',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts/',
      ),
    });
    const configureWorkerPortAsset = new Asset(this, `${id}WorkerListenerScript`, {
      path: path.join(__dirname, '..', 'scripts', 'python', 'worker-listening-port.py'),
    });

    const configWorkerPortLocalPath = worker.userData.addS3DownloadCommand({
      bucket: configureWorkerPortAsset.bucket,
      bucketKey: configureWorkerPortAsset.s3ObjectKey,
    });

    // Converting to lower case, as groups and pools are all stored in lower case in deadline.
    const groups = settings?.groups?.map(val => val.toLowerCase()).join(',') ?? '';
    const pools = settings?.pools?.map(val => val.toLowerCase()).join(',') ?? '';

    configureWorkerScriptAsset.executeOn({
      host: worker,
      args: [
        `'${groups}'`,
        `'${pools}'`,
        `'${settings?.region ?? ''}'`,
        `'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}'`,
        this.listenerPort.toString(),
        configWorkerPortLocalPath,
      ],
    });
  }
}
