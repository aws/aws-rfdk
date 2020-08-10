/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Alarm } from '@aws-cdk/aws-cloudwatch';
import {
  Rule,
  RuleTargetInput,
  Schedule,
} from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import {
  Code,
  LogRetention,
  Runtime,
  SingletonFunction,
} from '@aws-cdk/aws-lambda';
import {
  ILogGroup,
  LogGroup,
  RetentionDays,
} from '@aws-cdk/aws-logs';
import { Construct, Duration } from '@aws-cdk/core';

/**
 * Properties for setting up an {@link ExportingLogGroup}.
 */
export interface ExportingLogGroupProps {
  /**
   * The S3 bucket's name to export the logs to. Bucket must already exist and have read/write privilidges enabled for
   * logs.amazonaws.com.
   */
  readonly bucketName: string;

  /**
   * The log group name.
   */
  readonly logGroupName: string;

  /**
   * The number of days log events are kept in CloudWatch Logs. Exportation to S3 will happen the hour before
   * they expire in CloudWatch. Retention in S3 must be configured on the S3 Bucket provided.
   * @default - 3 days
   */
  readonly retention?: RetentionDays;
}

/**
 * This construct takes the name of a CloudWatch LogGroup and will either create it if it doesn't already exist,
 * or reuse the existing one. It also creates a regularly scheduled lambda that will export LogEvents to S3
 * before they expire in CloudWatch.
 *
 * It's used for cost-reduction, as it is more economical to archive logs in S3 than CloudWatch when
 * retaining them for more than a week.
 * Note, that it isn't economical to export logs to S3 if you plan on storing them for less than
 * 7 days total (CloudWatch and S3 combined).
 *
 * Resources Deployed
 * ------------------------
 * 1) The Lambda SingletonFunction that checks for the existence of the LogGroup;
 * 2) The CloudWatch LogGroup (if it didn't exist already);
 * 3) The CloudWatch Alarm watching log exportation failures;
 * 4) The CloudWatch Event Rule to schedule log exportation;
 * 5) The Lambda SingletonFunction, with role, to export log groups to S3 by schedule.
 *
 * Residual Risk
 * ------------------------
 * - The Lambda's Role grants the Lambda permission:
 *    1) To export the log group that this construct is exporting
 *       to ***any*** S3 bucket that your account has write-access to.
 *
 * @ResourcesDeployed
 * @ResidualRisk
 */
export class ExportingLogGroup extends Construct {
  /**
   * The LogGroup created or fetched for the given name.
   */
  public readonly logGroup: ILogGroup;

  /**
   * CloudWatch alarm on the error metric of the export LogGroup task Lambda.
   */
  public readonly exportErrorAlarm: Alarm;

  /**
   * UUID needed to identify the SingletonFunction for the log exporter.
   */
  private readonly LOG_EXPORTER_UUID = '6382448c-e4b2-42e9-b14f-a0a9ccdb198e';
  /**
   * Duration of time between export task Lambda runs.
   */
  private readonly EXPORT_TASK_FREQUENCY = Duration.hours(1);
  /**
   * Default value for the number of days to retain logs in CloudWatch for.
   */
  private readonly RETENTION_DEFAULT = RetentionDays.THREE_DAYS;

  constructor(scope: Construct, id: string, props: ExportingLogGroupProps) {
    super(scope, id);

    const retentionInDays = props.retention ? props.retention : this.RETENTION_DEFAULT;

    const exportLogsFunction = this.setupLogsExporter();
    this.exportErrorAlarm = exportLogsFunction.metricErrors().createAlarm(this, 'LogExporterFailureAlarm', {
      evaluationPeriods: 1,
      threshold: 1,
    });

    const logRetention = new LogRetention(this, 'LogRetention', {
      logGroupName: props.logGroupName,
      retention: retentionInDays,
    });

    this.logGroup = LogGroup.fromLogGroupArn(scope, `${props.logGroupName}LogGroup`, logRetention.logGroupArn);
    this.logGroup.grant(exportLogsFunction, 'logs:CreateExportTask');

    const scheduledLogExportation = new Rule(this, 'LogExporterRule', {
      schedule: Schedule.rate(this.EXPORT_TASK_FREQUENCY),
    });

    scheduledLogExportation.addTarget(new LambdaFunction(exportLogsFunction, {
      event: RuleTargetInput.fromObject({
        BucketName: props.bucketName,
        ExportFrequencyInHours: this.EXPORT_TASK_FREQUENCY.toHours(),
        LogGroupName: props.logGroupName,
        RetentionInHours: retentionInDays.valueOf() * 24,
      }),
    }));
  }

  private setupLogsExporter(): SingletonFunction {
    const exportLogsFunction = new SingletonFunction(this, 'LogExporterFunction', {
      code: Code.fromAsset(path.join(__dirname, '../lambdas/nodejs/export-logs')),
      handler: 'index.handler',
      lambdaPurpose: 'LogGroupExporter',
      logRetention: RetentionDays.ONE_DAY,
      runtime: Runtime.NODEJS_12_X,
      uuid: this.LOG_EXPORTER_UUID,
    });

    exportLogsFunction.addToRolePolicy(new PolicyStatement({
      actions: ['logs:DescribeExportTasks'],
      effect: Effect.ALLOW,
      resources: ['*'],
    }));

    return exportLogsFunction;
  }
}
