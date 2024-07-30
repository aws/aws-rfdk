/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

/* eslint-disable import/no-extraneous-dependencies */
import {
  CloudWatchLogsClient,
  CreateExportTaskCommand,
  DescribeExportTasksCommand,
} from '@aws-sdk/client-cloudwatch-logs';
/* eslint-enable import/no-extraneous-dependencies */

function sleep(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, timeout);
  });
}

/**
 * Make sure that a task completes successfully. This does increase the length of time the Lambda runs by
 * quite a bit, but Lambdas are cheap and we want to know if our logs are exporting properly.
 */
async function confirmTaskCompletion(taskId: string): Promise<void> {
  const cloudwatchlogs = new CloudWatchLogsClient();

  let errorCount = 0;
  let complete = false;
  while (!complete) {
    try {
      const response = await cloudwatchlogs.send(new DescribeExportTasksCommand({ taskId }));
      if (response.exportTasks?.length !== 1) {
        throw new Error(`Received ${response.exportTasks?.length} export tasks from DescribeExportTasks for task ${taskId}.`);
      }

      const task = response.exportTasks[0];
      if (!task.status || !task.status.code) {
        throw new Error(`Task ${taskId} did not return a status code.`);
      }

      const taskStatus = task.status.code;
      if (taskStatus === 'RUNNING' || taskStatus.indexOf('PENDING') !== -1) {
        await sleep(500);
      } else if (taskStatus === 'FAILED' || taskStatus === 'CANCELLED') {
        throw new Error(`Task ${taskId} failed with status code: ${taskStatus}`);
      } else {
        console.log(`${taskId}: Task has completed successfully!`);
        complete = true;
      }
    } catch (e) {
      // Retry 3 times before giving up
      if (errorCount < 3) {
        console.error(`${taskId}: Encountered failure #${errorCount} with message: ${(e as Error)?.message}`);
        errorCount++;
      } else {
        throw e;
      }
    }
  }
}

function getDatePath(dateObj: Date): string {
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const date = dateObj.getDate();
  return `${year}/${month}/${date}`;
}

async function exportToS3Task(
  bucketName: string,
  exportFrequencyInHours: number,
  logGroupName: string,
  retentionInHours: number): Promise<void> {
  const cloudwatchlogs = new CloudWatchLogsClient();

  // End time is now minus the retention period in CloudWatch plus one hour. This creates an extra hour buffer to
  // make sure no logs expire before they get exported.
  const endTime = new Date();
  endTime.setHours(endTime.getHours() - retentionInHours + 1);

  // Start time is the end time minus the frequency that the Lambda is run, with an extra minute taken off to account
  // for any drift in Lambda execution times between runs.
  const startTime = new Date();
  startTime.setHours(endTime.getHours() - exportFrequencyInHours);
  startTime.setMinutes(startTime.getMinutes() - 1);

  const destinationPrefix = `${logGroupName}/${getDatePath(new Date())}`;

  const params = {
    destination: bucketName,
    destinationPrefix,
    from: startTime.getTime(),
    logGroupName,
    to: endTime.getTime(),
  };
  const response = await cloudwatchlogs.send(new CreateExportTaskCommand(params));
  if (response.taskId) {
    console.log(`${response.taskId}: Successfully created export task for ${logGroupName}.`);
    console.log(`Exporting into ${bucketName} from ${startTime} to ${endTime}.`);
    await confirmTaskCompletion(response.taskId);
  } else {
    throw new Error(`For logGroup ${logGroupName}, No error thrown for CreateExportTask, but no task ID was received.`);
  }
}

/**
 * Lambda for exporting logs from CloudWatch to S3.
 *
 * @param event.BucketName The name of the S3 bucket to export the logs into
 * @param event.ExportFrequencyInHours How often this Lambda runs
 * @param event.LogGroupName The name of the LogGroup to export the logs from
 * @param event.RetentionInHours The retention period for logs in CloudWatch
 */
export async function handler(event: any): Promise<void> {
  await exportToS3Task(
    event.BucketName,
    event.ExportFrequencyInHours,
    event.LogGroupName,
    event.RetentionInHours);
}
