/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect as expectCDK, haveResourceLike } from '@aws-cdk/assert';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Stack } from '@aws-cdk/core';
import { LogGroupFactory } from '../lib/log-group-factory';

describe('log group', () => {
  test('created correctly with defaults', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup');

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      RetentionInDays: 3,
    }));
    expectCDK(stack).notTo(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));
  });

  test('created correctly with prefix', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      logGroupPrefix: 'prefix-',
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'prefix-testLogGroup',
      RetentionInDays: 3,
    }));
    expectCDK(stack).notTo(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));
  });

  test('created correctly with custom retention', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      retention: RetentionDays.ONE_WEEK,
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      RetentionInDays: 7,
    }));
    expectCDK(stack).notTo(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));
  });
});

describe('exporting log group', () => {
  test('created correctly with defaults', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      bucketName: 'test-bucket',
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      RetentionInDays: 3,
    }));

    expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));
    expectCDK(stack).to(haveResourceLike('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"testLogGroup\",\"RetentionInHours\":72}',
        },
      ],
    }));
  });

  test('created correctly with prefix', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      bucketName: 'test-bucket',
      logGroupPrefix: 'prefix-',
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'prefix-testLogGroup',
      RetentionInDays: 3,
    }));

    expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));

    expectCDK(stack).to(haveResourceLike('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"prefix-testLogGroup\",\"RetentionInHours\":72}',
        },
      ],
    }));
  });

  test('created correctly with custom retention', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      bucketName: 'test-bucket',
      retention: RetentionDays.ONE_WEEK,
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      RetentionInDays: 7,
    }));

    expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    }));

    expectCDK(stack).to(haveResourceLike('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"testLogGroup\",\"RetentionInHours\":168}',
        },
      ],
    }));
  });
});
