/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ABSENT,
  expect as expectCDK,
  haveResourceLike,
  stringLike,
} from '@aws-cdk/assert';
import {
  App,
  Stack,
} from '@aws-cdk/core';

import {
  VersionQuery,
} from '../lib';

import { VERSION_QUERY_ASSET } from './asset-constants';

test('VersionQuery constructor full', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery', { version: '10.1.9'});

  expectCDK(stack).to(haveResourceLike('Custom::RFDK_DEADLINE_INSTALLERS', {
    versionString: '10.1.9',
  }));
  expectCDK(stack).to(haveResourceLike('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
        },
      ],
    },
    ManagedPolicyArns: [
      {
        'Fn::Join': [
          '',
          [
            'arn:',
            {
              Ref: 'AWS::Partition',
            },
            ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        ],
      },
    ],
  }));
  expectCDK(stack).to(haveResourceLike('AWS::Lambda::Function', {
    Code: {
      S3Bucket: {
        Ref: VERSION_QUERY_ASSET.Bucket,
      },
      S3Key: {
        'Fn::Join': [
          '',
          [
            {
              'Fn::Select': [
                0,
                {
                  'Fn::Split': [
                    '||',
                    {
                      Ref: VERSION_QUERY_ASSET.Key,
                    },
                  ],
                },
              ],
            },
            {
              'Fn::Select': [
                1,
                {
                  'Fn::Split': [
                    '||',
                    {
                      Ref: VERSION_QUERY_ASSET.Key,
                    },
                  ],
                },
              ],
            },
          ],
        ],
      },
    },
    Handler: 'version-provider.handler',
    Role: {
      'Fn::GetAtt': [
        stringLike('SingletonLambda*ServiceRole*'),
        'Arn',
      ],
    },
    Runtime: 'nodejs12.x',
  }));
});

test('VersionQuery constructor no versionString', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery');

  expectCDK(stack).to(haveResourceLike('Custom::RFDK_DEADLINE_INSTALLERS', {
    versionString: ABSENT,
  }));
});
