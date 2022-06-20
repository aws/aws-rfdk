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
  CustomResource,
  Stack,
} from '@aws-cdk/core';

import {
  Installer,
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
    Runtime: 'nodejs16.x',
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

describe('VersionQuery.linuxInstallers', () => {
  let customResource: CustomResource;
  let versionQuery: VersionQuery;
  let stack: Stack;

  beforeAll(() => {
    // GIVEN
    const app = new App();
    stack = new Stack(app, 'Stack');
    versionQuery = new VersionQuery(stack, 'VersionQuery');
    customResource = versionQuery.node.findChild('DeadlineResource') as CustomResource;
  });

  describe('.repository', () => {
    let repoInstaller: Installer;

    beforeAll(() => {
      // WHEN
      repoInstaller = versionQuery.linuxInstallers.repository;
    });

    test('S3 bucket from Custom::RFDK_DEADLINE_INSTALLERS "S3Bucket" attribute', () => {
      // THEN
      expect(stack.resolve(repoInstaller.s3Bucket.bucketName))
        .toEqual(stack.resolve(customResource.getAtt('S3Bucket')));
    });

    test('S3 object key from Custom::RFDK_DEADLINE_INSTALLERS "LinuxRepositoryInstaller" attribute', () => {
      // THEN
      expect(stack.resolve(repoInstaller.objectKey))
        .toEqual(stack.resolve(customResource.getAtt('LinuxRepositoryInstaller')));
    });
  });

  describe('.client', () => {
    let clientInstaller: Installer;

    beforeAll(() => {
      // WHEN
      clientInstaller = versionQuery.linuxInstallers.client;
    });

    test('S3 bucket from Custom::RFDK_DEADLINE_INSTALLERS "S3Bucket" attribute', () => {
      // THEN
      expect(stack.resolve(clientInstaller.s3Bucket.bucketName))
        .toEqual(stack.resolve(customResource.getAtt('S3Bucket')));
    });

    test('S3 object key from Custom::RFDK_DEADLINE_INSTALLERS "LinuxClientInstaller" attribute', () => {
      // THEN
      expect(stack.resolve(clientInstaller.objectKey))
        .toEqual(stack.resolve(customResource.getAtt('LinuxClientInstaller')));
    });
  });
});
