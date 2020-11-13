/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import {AutoScaling} from 'aws-sdk';

// @ts-ignore
export async function handler(event: AWSLambda.SNSEvent, context: AWSLambda.Context) {

  console.log(JSON.stringify(event));

  try {

    // each alarm notification should have only one record.
    if (event.Records.length !== 1) {
      throw new Error('Expecting a single record in SNS Event, found ' + event.Records.length);
    }

    const record = event.Records[0];

    if (!record.Sns || !record.Sns.Message) {
      throw new Error('No message found in the SNS Event.');
    }

    const message = JSON.parse(record.Sns.Message);
    const metrics = message.Trigger.Metrics;

    /**
     * The unhealthy fleet alarm is created using following 3 metrics:
     * 1. ASG desired capacity
     * 2. Unhealthy target count
     * 3. Expression to calculate percent
     * If these 3 metrics are not passed, throw an exception, something went wrong.
     */
    if (!metrics || metrics.length !== 3) {
      throw new Error('Exactly 3 metrics should be present in the alarm message');
    }

    // find the metric with the ASG dimension in it.
    const autoScalingGroupDimensions = metrics.filter((metric: any) => metric.Id === 'fleetCapacity')
      .map((metric: any) => {
        if (metric && metric.MetricStat && metric.MetricStat.Metric && metric.MetricStat.Metric.Dimensions) {
          return metric.MetricStat.Metric.Dimensions.filter((dimension: any) => dimension.name === 'AutoScalingGroupName');
        }
      });

    if (autoScalingGroupDimensions.length !== 1) {
      throw new Error(`There should be exactly one Metric with Id "fleetCapacity". Found ${autoScalingGroupDimensions.length}`);
    }

    if (autoScalingGroupDimensions[0].length !== 1) {
      throw new Error(`There should be exactly one dimension with name "AutoScalingGroupName". Found ${autoScalingGroupDimensions[0].length}`);
    }

    const dimensionName = autoScalingGroupDimensions[0][0].name;
    const dimensionValue = autoScalingGroupDimensions[0][0].value;

    console.info(`Found fleet: ${dimensionName} with fleetId: ${dimensionValue}`);

    // this is an ASG Target, we need to suspend its size
    const autoScaling = new AutoScaling();
    await autoScaling.updateAutoScalingGroup({
      AutoScalingGroupName: dimensionValue,
      MaxSize: 0,
      MinSize: 0,
      DesiredCapacity: 0,
    }).promise().then((data: any) => {
      // successful response
      console.log(`Successfully suspended the fleet ${dimensionValue}: ${data}`);
    }).catch((err: any) => {
      // an error occurred
      throw new Error(`Exception while suspending fleet ${dimensionValue}: ${err}`);
    });
  } catch (e) {
    console.error(`ERROR: Exception while processing the event: ${e}`);
    return {
      status: 'ERROR',
      reason: e.message,
    };
  }

  return {status: 'OK'};
}
