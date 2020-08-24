/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResource,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
  WindowsImage,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {Stack} from '@aws-cdk/core';
import {
  CloudWatchAgent,
  CloudWatchConfigBuilder,
} from '../lib';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from './asset-constants';

describe('CloudWatchAgent', () => {
  let stack: Stack;
  let vpc: Vpc;
  let cloudWatchConfig: string;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'VPC');

    // Generate CloudWatch Agent configuration JSON
    const configBuilder = new CloudWatchConfigBuilder();
    cloudWatchConfig = configBuilder.generateCloudWatchConfiguration();
  });

  test('creates an SSM parameter containing the configuration', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    expectCDK(stack).to(haveResource('AWS::SSM::Parameter', {
      Type: 'String',
      Value: cloudWatchConfig,
    }));
  });

  test('creates an asset', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    // Find an asset created by the CloudWatchAgentConfigResource
    const asset = stack.node.metadata.find(m => m.type === 'aws:cdk:asset');
    expect(asset).toBeDefined();
  });

  test('creates an IAM policy to access the SSM parameter, CDK asset bucket, and CloudWatch agent bucket', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':s3:::',
                    { Ref: CWA_ASSET_LINUX.Bucket },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':s3:::',
                    { Ref: CWA_ASSET_LINUX.Bucket },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: [
              'ssm:DescribeParameters',
              'ssm:GetParameters',
              'ssm:GetParameter',
              'ssm:GetParameterHistory',
            ],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':ssm:',
                  { Ref: 'AWS::Region' },
                  ':',
                  { Ref: 'AWS::AccountId' },
                  ':parameter/',
                  { Ref: 'StringParameter472EED0E' },
                ],
              ],
            },
          },
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Effect: 'Allow',
            Resource: [
              'arn:aws:s3:::amazoncloudwatch-agent',
              'arn:aws:s3:::amazoncloudwatch-agent/*',
            ],
          },
        ],
        Version: '2012-10-17',
      },
      PolicyName: 'InstanceInstanceRoleDefaultPolicy4ACE9290',
      Roles: [ { Ref: 'InstanceInstanceRoleE9785DE5' } ],
    }));
  });

  test('adds user data commands to fetch and execute the script (linux)', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    const userData = stack.resolve(host.userData.render());
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          "#!/bin/bash\nmkdir -p $(dirname '/tmp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_LINUX.Key },
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
                  { Ref: CWA_ASSET_LINUX.Key },
                ],
              },
            ],
          },
          "')\naws s3 cp 's3://",
          { Ref: CWA_ASSET_LINUX.Bucket },
          '/',
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_LINUX.Key },
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
                  { Ref: CWA_ASSET_LINUX.Key },
                ],
              },
            ],
          },
          "' '/tmp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_LINUX.Key },
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
                  { Ref: CWA_ASSET_LINUX.Key },
                ],
              },
            ],
          },
          "'\nset -e\nchmod +x '/tmp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_LINUX.Key },
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
                  { Ref: CWA_ASSET_LINUX.Key },
                ],
              },
            ],
          },
          "'\n'/tmp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_LINUX.Key },
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
                  { Ref: CWA_ASSET_LINUX.Key },
                ],
              },
            ],
          },
          "' ",
          { Ref: 'StringParameter472EED0E' },
        ],
      ],
    });
  });

  test('adds user data commands to fetch and execute the script (windows)', () => {
    // GIVEN
    const host = new Instance(stack, 'Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new WindowsImage(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
      vpc,
    });

    // WHEN
    new CloudWatchAgent(stack, 'testResource', {
      cloudWatchConfig,
      host,
    });

    // THEN
    const userData = stack.resolve(host.userData.render());
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          "<powershell>mkdir (Split-Path -Path 'C:/temp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_WINDOWS.Key },
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
                  { Ref: CWA_ASSET_WINDOWS.Key },
                ],
              },
            ],
          },
          "' ) -ea 0\nRead-S3Object -BucketName '",
          { Ref: CWA_ASSET_WINDOWS.Bucket },
          "' -key '",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_WINDOWS.Key },
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
                  { Ref: CWA_ASSET_WINDOWS.Key },
                ],
              },
            ],
          },
          "' -file 'C:/temp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_WINDOWS.Key },
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
                  { Ref: CWA_ASSET_WINDOWS.Key },
                ],
              },
            ],
          },
          "' -ErrorAction Stop\n&'C:/temp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_WINDOWS.Key },
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
                  { Ref: CWA_ASSET_WINDOWS.Key },
                ],
              },
            ],
          },
          "' ",
          { Ref: 'StringParameter472EED0E' },
          "\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/",
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  { Ref: CWA_ASSET_WINDOWS.Key },
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
                  { Ref: CWA_ASSET_WINDOWS.Key },
                ],
              },
            ],
          },
          "\"' -ErrorAction Stop }</powershell>",
        ],
      ],
    });
  });
});
