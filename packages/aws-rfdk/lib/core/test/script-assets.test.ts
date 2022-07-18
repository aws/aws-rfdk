/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { Stack } from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
  WindowsImage,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';

import { ScriptAsset } from '../lib/script-assets';

import { CWA_ASSET_LINUX, CWA_ASSET_WINDOWS } from './asset-constants';

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
    [linuxImage, '../scripts/bash/configureCloudWatchAgent.sh', CWA_ASSET_LINUX.Bucket],
    [windowsImage, '../scripts/powershell/configureCloudWatchAgent.ps1', CWA_ASSET_WINDOWS.Bucket],
  ])('grants read permissions', (machineImage: AmazonLinuxImage | WindowsImage, scriptLocation: string, bucketKey: string) => {
    // GIVEN
    const instance = new Instance(stack, 'inst', {
      vpc,
      instanceType,
      machineImage,
    });
    const asset = new ScriptAsset(stack, 'asset', {
      path: path.join(__dirname, scriptLocation),
    });

    // WHEN
    asset.executeOn({ host: instance });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
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
                    { 'Fn::Sub': bucketKey },
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
                    { 'Fn::Sub': bucketKey },
                    '/*',
                  ],
                ],
              },
            ],
          },
        ]),
        Version: '2012-10-17',
      },
      PolicyName: 'instInstanceRoleDefaultPolicyCB9E402C',
      Roles: [ { Ref: 'instInstanceRoleFE783FB1' } ],
    });
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
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `#!/bin/bash\nmkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CWA_ASSET_LINUX.Bucket,
              },
              `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\nset -e\nchmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh' arg1`,
            ],
          ],
        },
      },
    });
  });

  test('downloads and executes script for windows', () => {
    // GIVEN
    const instance = new Instance(stack, 'inst', {
      vpc,
      instanceType,
      machineImage: windowsImage,
    });
    const asset = new ScriptAsset(stack, 'asset', {
      path: path.join(__dirname, '../scripts/powershell/configureCloudWatchAgent.ps1'),
    });

    // WHEN
    asset.executeOn({
      host: instance,
      args: ['arg1'],
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `<powershell>mkdir (Split-Path -Path 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CWA_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CWA_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
              `&'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' arg1\nif (!$?) { Write-Error 'Failed to execute the file "C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1"' -ErrorAction Stop }</powershell>`,
            ],
          ],
        },
      },
    });
  });
});
