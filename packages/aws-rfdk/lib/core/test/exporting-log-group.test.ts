/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket } from '@aws-cdk/aws-s3';
import { Stack } from '@aws-cdk/core';
import { ExportingLogGroup } from '../lib/exporting-log-group';

test('default exporting log group is created correctly', () => {
  const stack = new Stack();

  const bucket = new Bucket(stack, 'DestinationBucket', {
    bucketName: 'test-bucket',
  });

  // WHEN
  new ExportingLogGroup(stack, 'ExportingLogGroup', {
    bucketName: bucket.bucketName,
    logGroupName: 'logGroup',
  });

  // THEN
  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    ServiceToken: {
      'Fn::GetAtt': [
        'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A',
        'Arn',
      ],
    },
    LogGroupName: 'logGroup',
    RetentionInDays: 3,
  }));
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'logs:DescribeExportTasks',
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'logs:CreateExportTask',
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':logs:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':log-group:',
                {
                  'Fn::GetAtt': [
                    'ExportingLogGroupLogRetention80FFADE8',
                    'LogGroupName',
                  ],
                },
                ':*',
              ],
            ],
          },
        },
      ],
    },
  }));

  expectCDK(stack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    EvaluationPeriods: 1,
    Dimensions: [
      {
        Name: 'FunctionName',
        Value: {
          Ref: 'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eC741F553',
        },
      },
    ],
    MetricName: 'Errors',
    Namespace: 'AWS/Lambda',
    Period: 300,
    Statistic: 'Sum',
    Threshold: 1,
  }));

  expectCDK(stack).to(haveResourceLike('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 hour)',
    State: 'ENABLED',
    Targets: [
      {
        Arn: {
          'Fn::GetAtt': [
            'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eC741F553',
            'Arn',
          ],
        },
        Id: 'Target0',
        Input: {
          'Fn::Join': [
            '',
            [
              '{\"BucketName\":\"',
              {
                Ref: 'DestinationBucket4BECDB47',
              },
              '\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"logGroup\",\"RetentionInHours\":72}',
            ],
          ],
        },
      },
    ],
  }));
  expectCDK(stack).to(haveResource('AWS::Lambda::Function'));
});

test('custom set retention is created correctly', () => {
  const stack = new Stack();

  const bucket = new Bucket(stack, 'DestinationBucket', {
    bucketName: 'test-bucket',
  });

  // WHEN
  new ExportingLogGroup(stack, 'ExportingLogGroup', {
    bucketName: bucket.bucketName,
    logGroupName: 'logGroup',
    retention: RetentionDays.ONE_WEEK,
  });

  // THEN
  expectCDK(stack).to(haveResource('Custom::LogRetention', {
    ServiceToken: {
      'Fn::GetAtt': [
        'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A',
        'Arn',
      ],
    },
    LogGroupName: 'logGroup',
    RetentionInDays: 7,
  }));
  expectCDK(stack).to(haveResource('AWS::Lambda::Function'));
  expectCDK(stack).to(haveResource('AWS::CloudWatch::Alarm'));
  expectCDK(stack).to(haveResource('AWS::Events::Rule'));
});
