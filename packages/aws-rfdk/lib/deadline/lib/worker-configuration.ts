/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  OperatingSystemType,
} from '@aws-cdk/aws-ec2';
import {
  IGrantable,
} from '@aws-cdk/aws-iam';
import {
  Construct,
  Duration,
} from '@aws-cdk/core';
import {
  CloudWatchAgent,
  CloudWatchConfigBuilder,
  IScriptHost,
  LogGroupFactory,
  LogGroupFactoryProps,
  ScriptAsset,
} from '../../core';
import { Version } from './version';

/**
 * Interface for Deadline clients that can be configured via the ClientConfiguration
 * helper class.
 */
export interface IConfigurableWorker extends IScriptHost, IGrantable {
}

/**
 * The Deadline Worker settings that can be configured via the configureWorkerSettings method
 * of the WorkerConfiguration helper class.
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
}

/**
 * This is a helper construct for configuring Deadline Workers to connect to a RenderQueue, send their
 * log files to CloudWatch, and similar common actions.
 *
 * Security Considerations
 * ------------------------
 * - The instances configured by this construct will download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 */
export class WorkerConfiguration extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
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
   * @param logGroupProps Configuration for the log group in CloudWatch.
   */
  public configureCloudWatchLogStream(worker: IConfigurableWorker, id: string, logGroupProps?: LogGroupFactoryProps): void {
    const logGroup = LogGroupFactory.createOrFetch(this, `${id}LogGroupWrapper`, `${id}`, logGroupProps);

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

    new CloudWatchAgent(this, `${id}WorkerFleetLogsConfig`, {
      cloudWatchConfig: cloudWatchConfigurationBuilder.generateCloudWatchConfiguration(),
      host: worker,
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
  public configureWorkerSettings(worker: IConfigurableWorker, id: string, settings?: WorkerSettings): void {
    const configureWorkerScriptAsset = ScriptAsset.fromPathConvention(this, `${id}WorkerConfigurationScript`, {
      osType: worker.osType,
      baseName: 'configureWorker',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts/',
      ),
    });

    // Converting to lower case, as groups and pools are all stored in lower case in deadline.
    const groups = settings?.groups?.map(val => val.toLowerCase()).join(',') ?? ''; // props.groups ? props.groups.map(val => val.toLowerCase()).join(',') : '';
    const pools = settings?.pools?.map(val => val.toLowerCase()).join(',') ?? ''; // props.pools ? props.pools.map(val => val.toLowerCase()).join(',') : '';

    configureWorkerScriptAsset.executeOn({
      host: worker,
      args: [
        `'${groups}'`,
        `'${pools}'`,
        `'${settings?.region ?? ''}'`,
        `'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}'`,
      ],
    });
  }
}
