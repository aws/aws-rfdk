/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CustomResource,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';

import {
  Installer,
  VersionQuery,
} from '../lib';

test('VersionQuery constructor full version', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery', { version: '10.1.9.2'});

  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_DEADLINE_INSTALLERS', {
    forceRun: Match.absent(),
    versionString: '10.1.9.2',
  });
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
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
  });
  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'version-provider.handler',
    Role: {
      'Fn::GetAtt': [
        Match.stringLikeRegexp('SingletonLambda.*ServiceRole.*'),
        'Arn',
      ],
    },
    Runtime: 'nodejs18.x',
  });
});

test('VersionQuery constructor no versionString', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery');

  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_DEADLINE_INSTALLERS', {
    forceRun: Match.anyValue(),
    versionString: Match.absent(),
  });
});

test.each([
  ['10.1.9'],
  ['10.1'],
  ['10'],
])('VersionQuery constructor partial version: %s', (version: string) => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
  new VersionQuery(stack, 'VersionQuery', { version });

  Template.fromStack(stack).hasResourceProperties('Custom::RFDK_DEADLINE_INSTALLERS', {
    versionString: version,
    forceRun: Match.anyValue(),
  });
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
