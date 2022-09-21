/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Duration, Stack } from 'aws-cdk-lib';
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import {
  Rule,
  RuleTargetInput,
  Schedule,
} from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code,
  Runtime,
  SingletonFunction,
  CfnFunction,
} from 'aws-cdk-lib/aws-lambda';
import {
  ILogGroup,
  LogGroup,
  LogRetention,
  RetentionDays,
} from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

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
 * - The Lambda SingletonFunction that checks for the existence of the LogGroup.
 * - The CloudWatch LogGroup (if it didn't exist already).
 * - The CloudWatch Alarm watching log exportation failures.
 * - The CloudWatch Event Rule to schedule log exportation.
 * - The Lambda SingletonFunction, with role, to export log groups to S3 by schedule.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
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

    // Define log retention retry options to reduce the risk of the rate exceed error
    // as the default create log group TPS is only 5. Make sure to set the timeout of log retention function
    // to be greater than total retry time. That's because if the function that is used for a custom resource
    // doesn't exit properly, it'd end up in retries and may take cloud formation an hour to realize that
    // the custom resource failed.
    const logRetention = new LogRetention(this, 'LogRetention', {
      logGroupName: props.logGroupName,
      retention: retentionInDays,
      logRetentionRetryOptions: {
        base: Duration.millis(200),
        maxRetries: 7,
      },
    });
    // referenced from cdk code: https://github.com/aws/aws-cdk/blob/v2.33.0/packages/@aws-cdk/aws-logs/lib/log-retention.ts#L116
    const logRetentionFunctionConstructId = 'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a';
    const logRetentionFunction = Stack.of(this).node.findChild(logRetentionFunctionConstructId);
    const cfnFunction = logRetentionFunction.node.defaultChild as CfnFunction;
    cfnFunction.addPropertyOverride('Timeout', 30);

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
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs', 'export-logs')),
      handler: 'index.handler',
      lambdaPurpose: 'LogGroupExporter',
      logRetention: RetentionDays.ONE_DAY,
      runtime: Runtime.NODEJS_16_X,
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
