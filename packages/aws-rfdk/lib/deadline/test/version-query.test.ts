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

test('VersionQuery constructor full version', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery', { version: '10.1.9.2'});

  expectCDK(stack).to(haveResourceLike('Custom::RFDK_DEADLINE_INSTALLERS', {
    forceRun: ABSENT,
    versionString: '10.1.9.2',
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
    forceRun: stringLike('*'),
    versionString: ABSENT,
  }));
});

test.each([
  ['10.1.9'],
  ['10.1'],
  ['10'],
])('VersionQuery constructor partial version: %s', (version: string) => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery', { version });

  expectCDK(stack).to(haveResourceLike('Custom::RFDK_DEADLINE_INSTALLERS', {
    versionString: version,
    forceRun: stringLike('*'),
  }));
});
