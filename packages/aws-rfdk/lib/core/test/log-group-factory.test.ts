/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { LogGroupFactory } from '../lib/log-group-factory';

describe('log group', () => {
  test('created correctly with defaults', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup');

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 3,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);
    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  Match.not({
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
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'prefix-testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 3,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  Match.not({
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
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 7,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  Match.not({
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
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 3,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    });
    Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"testLogGroup\",\"RetentionInHours\":72}',
        },
      ],
    });
  });

  test('created correctly with prefix', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      bucketName: 'test-bucket',
      logGroupPrefix: 'prefix-',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'prefix-testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 3,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"prefix-testLogGroup\",\"RetentionInHours\":72}',
        },
      ],
    });
  });

  test('created correctly with custom retention', () => {
    const stack = new Stack();

    // WHEN
    LogGroupFactory.createOrFetch(stack, 'TestId', 'testLogGroup', {
      bucketName: 'test-bucket',
      retention: RetentionDays.ONE_WEEK,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: 'testLogGroup',
      SdkRetry: {
        maxRetries: 7,
      },
      RetentionInDays: 7,
    });

    expect(Object.keys(Template.fromStack(stack).findResources('AWS::Lambda::Function', {
      Properties: {
        Role: {
          'Fn::GetAtt': [
            'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB',
            'Arn',
          ],
        },
        Timeout: 30,
      },
    })).length).toEqual(1);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function',  {
      Role: {
        'Fn::GetAtt': [
          'LogGroupExporter6382448ce4b242e9b14fa0a9ccdb198eServiceRoleB67C808B',
          'Arn',
        ],
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
      Targets: [
        {
          Input: '{\"BucketName\":\"test-bucket\",\"ExportFrequencyInHours\":1,\"LogGroupName\":\"testLogGroup\",\"RetentionInHours\":168}',
        },
      ],
    });
  });
});
