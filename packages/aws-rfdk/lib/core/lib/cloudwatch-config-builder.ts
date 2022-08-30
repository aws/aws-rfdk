/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {Duration} from 'aws-cdk-lib';

/**
 * Enum to describe the time zone property
 */
export enum TimeZone {
  /**
   * The Local time zone
   */
  LOCAL = 'Local',

  /**
   * The UTC time zone
   */
  UTC = 'UTC'
}

/**
 * This interface maps the json configuration of the log file property of the log stream for the
 * Cloud Watch agent configuration.
 */
interface CloudWatchLogFile {
  file_path: string;
  log_group_name: string;
  log_stream_name: string;
  timezone: string;
}

/**
 * Class that can build a CloudWatch Agent configuration.
 */
export class CloudWatchConfigBuilder {

  private static DEFAULT_STREAM_NAME = 'DefaultLogStream';
  private static DEFAULT_FLUSH_INTERVAL = Duration.seconds(60);
  private static DEFAULT_LOG_TIMEZONE = TimeZone.LOCAL;
  private static CLOUDWATCH_CONFIG_INSTANCE_ID_VARIABLE = '{instance_id}';

  /**
   * Flush interval of the Cloud Watch Agent (in Seconds)
   */
  public readonly logFlushInterval: Duration;
  private cloudWatchFileList: CloudWatchLogFile[] = [];

  /**
   * Constructs
   */
  constructor(logFlushInterval: Duration = CloudWatchConfigBuilder.DEFAULT_FLUSH_INTERVAL) {
    this.logFlushInterval = logFlushInterval;
  }

  /**
   * This method adds the log file path and its associated log group and log stream properties to the list
   * of files which needs to be streamed to cloud watch logs.
   *
   * @param logGroupName - string for the log group name
   * @param logStreamPrefix - string for the log stream prefix. The actual stream name will be appended by instance id
   * @param logFilePath - local file path which needs to be streamed
   * @param timeZone -  the time zone to use when putting timestamps on log events
   */
  public addLogsCollectList(
    logGroupName: string,
    logStreamPrefix: string,
    logFilePath: string,
    timeZone: TimeZone = CloudWatchConfigBuilder.DEFAULT_LOG_TIMEZONE): void {
    this.cloudWatchFileList.push({
      log_group_name: logGroupName,
      log_stream_name: logStreamPrefix + '-' + CloudWatchConfigBuilder.CLOUDWATCH_CONFIG_INSTANCE_ID_VARIABLE,
      file_path: logFilePath,
      timezone: timeZone,
    });
  }

  /**
   * The method generates the configuration for log file streaming to be added
   * to CloudWatch Agent Configuration File.
   */
  public generateCloudWatchConfiguration(): string {
    const cloudWatchConfig = {
      logs: {
        logs_collected: {
          files: {
            collect_list: this.cloudWatchFileList,
          },
        },
        log_stream_name: CloudWatchConfigBuilder.DEFAULT_STREAM_NAME
                    + '-'
                    + CloudWatchConfigBuilder.CLOUDWATCH_CONFIG_INSTANCE_ID_VARIABLE,
        force_flush_interval: this.logFlushInterval.toSeconds(),
      },
    };
    return JSON.stringify(cloudWatchConfig);
  }
}
