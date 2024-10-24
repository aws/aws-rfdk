/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  AutoScalingClient, UpdateAutoScalingGroupCommand, ScalingActivityInProgressFault,
} from '@aws-sdk/client-auto-scaling';
import { mockClient } from 'aws-sdk-client-mock';
import * as lambdaCode from '../index';
import 'aws-sdk-client-mock-jest';

const autoScalingMock = mockClient(AutoScalingClient);

const sampleEvent = {
  Records: [{
    EventSource: 'aws:sns',
    EventVersion: '1.0',
    EventSubscriptionArn: 'arn-test',
    Sns: {
      Type: 'Notification',
      MessageId: '8b15e083-30a3-5a57-a17e-b7a721ad365d',
      TopicArn: 'arn-test',
      Subject: 'ALARM: "test" in US West (Oregon)',
      Timestamp: '2020-04-29T23:33:34.928Z',
      Message: '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimensions":[{"value":"testFleetId","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}',
      SignatureVersion: '1',
      Signature: 'testSignature',
      SigningCertUrl: 'testSigningCertUrl',
      UnsubscribeUrl: 'testUnsubscribeURL',
      MessageAttributes: {},
    },
  }],
} as AWSLambda.SNSEvent;

const context = {
  functionName: 'provider',
} as AWSLambda.Context;

beforeEach(() => {
  console.log = () => {};
  console.error = () => {};
  console.info = () => {};
});

afterEach(() => {
  autoScalingMock.reset();
});

test('success scenario single fleet', async () => {
  // WHEN
  autoScalingMock.on(UpdateAutoScalingGroupCommand).resolves({});

  const result = (await lambdaCode.handler(sampleEvent, context));

  // THEN
  expect(result.status).toEqual('OK');

  expect(autoScalingMock).toHaveReceivedCommandWith(UpdateAutoScalingGroupCommand, {
    AutoScalingGroupName: 'testFleetId',
    MaxSize: 0,
    MinSize: 0,
    DesiredCapacity: 0,
  });
});

test('failure scenario, AWS api returns failure', async () => {
  // WHEN
  const error = new ScalingActivityInProgressFault({message: 'test error', $metadata: {}});

  autoScalingMock.on(UpdateAutoScalingGroupCommand).rejects(error);

  const result = (await lambdaCode.handler(sampleEvent, context));

  // THEN
  expect(result.status).toEqual('ERROR');
  expect(result.reason).toMatch(/Exception while suspending fleet/);

  expect(autoScalingMock).toHaveReceivedCommandWith(UpdateAutoScalingGroupCommand, {
    AutoScalingGroupName: 'testFleetId',
    MaxSize: 0,
    MinSize: 0,
    DesiredCapacity: 0,
  });
});

test('failure scenario, MetricStat not found', async () => {
  // WHEN
  const successEventSingle = JSON.parse(JSON.stringify(sampleEvent));
  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","M":{"Metric":{"Dimensions":[{"value":"testFleetId2","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';

  autoScalingMock.on(UpdateAutoScalingGroupCommand).resolves({});

  const result = (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(result.status).toEqual('ERROR');

  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);
});

test('Error if 2 records are found', async () => {
  // WHEN
  const successEventSingle = JSON.parse(JSON.stringify(sampleEvent));
  successEventSingle.Records.push(JSON.parse(JSON.stringify(successEventSingle.Records[0])));

  autoScalingMock.on(UpdateAutoScalingGroupCommand).resolves({});

  const result = (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(result.status).toEqual('ERROR');
  expect(result.reason).toMatch(/Expecting a single record in SNS Event/);

  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);
});

test('Error if exactly 3 metrics are not found', async () => {
  // WHEN
  const successEventSingle = JSON.parse(JSON.stringify(sampleEvent));
  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimensions":[{"value":"testFleetId2","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';

  autoScalingMock.on(UpdateAutoScalingGroupCommand).resolves({});

  const result = (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(result.status).toEqual('ERROR');
  expect(result.reason).toMatch(/Exactly 3 metrics should be present in the alarm message/);

  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);
});

test('failure scenario, incorrect dimension, metrics and message', async () => {
  // WHEN
  const successEventSingle = JSON.parse(JSON.stringify(sampleEvent));

  autoScalingMock.on(UpdateAutoScalingGroupCommand).resolves({});

  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimensions":[{"value":"testFleetId","name":"AutoScalingGroup"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';
  (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);

  // WHEN
  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimen":[{"value":"testFleetId2","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';

  (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);

  // WHEN
  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","M":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"fleetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimen":[{"value":"testFleetId2","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';
  (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);

  // WHEN
  delete successEventSingle.Records[0].Sns.Message;
  (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);

  // WHEN
  successEventSingle.Records[0].Sns.Message = '{"AlarmName":"testAlarm","AlarmDescription":null,"NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 5 out of the last 5 datapoints were less than the threshold (65.0). The most recent datapoints which crossed the threshold: [0.0 (29/04/20 23:32:00), 0.0 (29/04/20 23:31:00), 0.0 (29/04/20 23:30:00), 0.0 (29/04/20 23:29:00), 0.0 (29/04/20 23:28:00)] (minimum 5 datapoints for OK -> ALARM transition).","StateChangeTime":"2020-04-29T23:33:34.876+0000","Region":"US West (Oregon)","AlarmArn":"test-arn","OldStateValue":"INSUFFICIENT_DATA","Trigger":{"Period":60,"EvaluationPeriods":5,"ComparisonOperator":"LessThanThreshold","Threshold":65.0,"TreatMissingData":"- TreatMissingData:                    missing","EvaluateLowSampleCountPercentile":"","Metrics":[{"Expression":"100*(healthyHostCount/fleetCapacity)","Id":"expr_1","ReturnData":true},{"Id":"healthyHostCount","Label":"HealthyHostCount","MetricStat":{"Metric":{"Dimensions":[{"value":"testTargetGroup","name":"TargetGroup"},{"value":"testLoadBalancer","name":"LoadBalancer"}],"MetricName":"HealthyHostCount","Namespace":"AWS/NetworkELB"},"Period":60,"Stat":"Average"},"ReturnData":false},{"Id":"eetCapacity","Label":"GroupDesiredCapacity","MetricStat":{"Metric":{"Dimensions":[{"value":"testFleetId","name":"AutoScalingGroupName"}],"MetricName":"GroupDesiredCapacity","Namespace":"AWS/AutoScaling"},"Period":60,"Stat":"Average"},"ReturnData":false}]}}';

  (await lambdaCode.handler(successEventSingle, context));

  // THEN
  expect(autoScalingMock).not.toHaveReceivedCommand(UpdateAutoScalingGroupCommand);
});
