/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogRetention } from '@aws-cdk/aws-lambda';
import {
  ILogGroup,
  LogGroup,
  RetentionDays,
} from '@aws-cdk/aws-logs';
import { Construct } from '@aws-cdk/core';
import { ExportingLogGroup } from './exporting-log-group';

/**
 * Properties for creating a LogGroup.
 */
export interface LogGroupFactoryProps {
  /**
   * The S3 bucket's name to export logs to. Setting this will enable exporting logs from CloudWatch to S3.
   * @default - No export to S3 will be performed.
   */
  readonly bucketName?: string;
  /**
   * Prefix assigned to the name of any LogGroups that get created.
   * @default - No prefix will be applied.
   */
  readonly logGroupPrefix?: string;

  /**
   * The number of days log events are kept in CloudWatch Logs. Exportation to S3 will happen the day before
   * they expire.
   * @default - 3 days.
   */
  readonly retention?: RetentionDays;
}

/**
 * This factory will return an ILogGroup based on the configuration provided to it. The LogGroup will either be
 * wrapped in a LogRetention from the aws-lambda package that has the ability to look up and reuse an existing LogGroup
 * or an ExportingLogGroup that uses a LogRetention and adds additional functionality to export the logs to S3.
 */
export class LogGroupFactory {
  /**
   * Either create a new LogGroup given the LogGroup name, or return the existing LogGroup.
   */
  public static createOrFetch(
    scope: Construct,
    logWrapperId: string,
    logGroupName: string,
    props?: LogGroupFactoryProps): ILogGroup {
    const fullLogGroupName = props?.logGroupPrefix ? `${props.logGroupPrefix}${logGroupName}` : logGroupName;
    const retention = props?.retention ? props.retention : LogGroupFactory.DEFAULT_LOG_RETENTION;

    return props?.bucketName
      ? new ExportingLogGroup(scope, logWrapperId, {
        bucketName: props.bucketName,
        logGroupName: fullLogGroupName,
        retention: props.retention,
      }).logGroup
      : LogGroup.fromLogGroupArn(
        scope,
        `${logGroupName}LogGroup`,
        new LogRetention(scope, logWrapperId, {
          logGroupName: fullLogGroupName,
          retention,
        }).logGroupArn);
  }

  /**
   * Default retention period to hold logs in CloudWatch for.
   */
  private static DEFAULT_LOG_RETENTION = RetentionDays.THREE_DAYS;
}
