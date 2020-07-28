/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import {
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
  WindowsImage,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import { Stack } from '@aws-cdk/core';

import { ScriptAsset } from '../lib/script-assets';

import { CWA_ASSET_LINUX } from './asset-constants';

const instanceType = InstanceType.of(InstanceClass.T3, InstanceSize.MICRO);
const linuxImage = new AmazonLinuxImage();
const windowsImage = new WindowsImage(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE);

describe('executeScriptAsset', () => {
  let stack: Stack;
  let vpc: Vpc;

  beforeEach(() => {
    // Create a new stack, vpc, and instance for each test
    stack = new Stack();
    vpc = new Vpc(stack, 'vpc');
  });

  it.each([
    [linuxImage],
    [windowsImage],
  ])('grants read permissions', (machineImage: AmazonLinuxImage | WindowsImage) => {
    // GIVEN
    const instance = new Instance(stack, 'inst', {
      vpc,
      instanceType,
      machineImage,
    });
    const asset = new ScriptAsset(stack, 'asset', {
      path: path.join(__dirname, '../scripts/bash/configureCloudWatchAgent.sh'),
    });

    // WHEN
    asset.executeOn({ host: instance });

    // THEN
    expectCDK(stack).to(haveResource('AWS::IAM::Policy', {
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
        ],
        Version: '2012-10-17',
      },
      PolicyName: 'instInstanceRoleDefaultPolicyCB9E402C',
      Roles: [ { Ref: 'instInstanceRoleFE783FB1' } ],
    }));
  });

  test('downloads and executes script for linux', () => {
    // GIVEN
    const instance = new Instance(stack, 'inst', {
      vpc,
      instanceType,
      machineImage: linuxImage,
    });
    const asset = new ScriptAsset(stack, 'asset', {
      path: path.join(__dirname, '../scripts/bash/configureCloudWatchAgent.sh'),
    });

    // WHEN
    asset.executeOn({
      host: instance,
      args: ['arg1'],
    });

    // THEN
    expectCDK(stack).to(haveResource('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
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
              "' arg1",
            ],
          ],
        },
      },
    }));
  });

  test('downloads and executes script for windows', () => {
    // GIVEN
    const instance = new Instance(stack, 'inst', {
      vpc,
      instanceType,
      machineImage: windowsImage,
    });
    const asset = new ScriptAsset(stack, 'asset', {
      path: path.join(__dirname, '../scripts/bash/configureCloudWatchAgent.sh'),
    });

    // WHEN
    asset.executeOn({
      host: instance,
      args: ['arg1'],
    });

    // THEN
    expectCDK(stack).to(haveResource('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
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
              "' ) -ea 0\nRead-S3Object -BucketName '",
              { Ref: CWA_ASSET_LINUX.Bucket },
              "' -key '",
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
              "' -file 'C:/temp/",
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
              "' -ErrorAction Stop\n&'C:/temp/",
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
              "' arg1\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/",
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
              "\"' -ErrorAction Stop }</powershell>",
            ],
          ],
        },
      },
    }));
  });
});