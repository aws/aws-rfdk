/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as cdkExpect,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceType,
  MachineImage,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  Stack,
} from '@aws-cdk/core';

import {
  MongoDbInstaller,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
} from '../lib';

import {
  INSTALL_MONGODB_3_6_SCRIPT_LINUX,
} from './asset-constants';
import {
  escapeTokenRegex,
} from './token-regex-helpers';

describe('Test MongoDbInstaller', () => {
  let stack: Stack;
  let vpc: Vpc;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
  });

  test('license rejection throws', () => {
    // GIVEN
    const errorString = `
The MongoDbInstaller will install MongoDB Community Edition onto one or more EC2 instances.

MongoDB is provided by MongoDB Inc. under the SSPL license. By installing MongoDB, you are agreeing to the terms of this license.
Follow the link below to read the terms of the SSPL license.
https://www.mongodb.com/licensing/server-side-public-license

By using the MongoDbInstaller to install MongoDB you agree to the terms of the SSPL license.

Please set the userSsplAcceptance property to USER_ACCEPTS_SSPL to signify your acceptance of the terms of the SSPL license.
`;

    // Must throw when providing no SSPL option.
    expect(() => {
      new MongoDbInstaller(stack, {
        version: MongoDbVersion.COMMUNITY_3_6,
      });
    }).toThrowError(errorString);
    // Must throw when explicitly rejecting the SSPL.
    expect(() => {
      new MongoDbInstaller(stack, {
        version: MongoDbVersion.COMMUNITY_3_6,
        userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL,
      });
    }).toThrowError(errorString);

  });

  test('linux installation', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    const installer = new MongoDbInstaller(stack, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
    });

    // WHEN
    installer.installOnLinuxInstance(instance);
    const userData = instance.userData.render();

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
            ],
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::',
                    {
                      Ref: INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
                    },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::',
                    {
                      Ref: INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
                    },
                    '/*',
                  ],
                ],
              },
            ],
          },
        ],
      },
    }));
    // Make sure we download the mountEFS script asset bundle
    const s3Copy = 'aws s3 cp \'s3://${Token[TOKEN.\\d+]}/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \'/tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\'';
    expect(userData).toMatch(new RegExp(escapeTokenRegex(s3Copy)));
    // Make sure we execute the script with the correct args
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash /tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}')));
  });

  test('assert Linux-only', () => {
    // GIVEN
    const windowsInstance = new Instance(stack, 'WindowsInstance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_SQL_2017_STANDARD),
    });
    const installer = new MongoDbInstaller(stack, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
    });

    // THEN
    expect(() => {
      installer.installOnLinuxInstance(windowsInstance);
    }).toThrowError('Target instance must be Linux.');
  });

  test('asset is singleton', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    const installer1 = new MongoDbInstaller(stack, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
    });
    const installer2 = new MongoDbInstaller(stack, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
    });

    // WHEN
    installer1.installOnLinuxInstance(instance);
    installer2.installOnLinuxInstance(instance);
    const userData = instance.userData.render();
    const s3Copy = 'aws s3 cp \'s3://${Token[TOKEN.\\d+]}/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\'';
    const regex = new RegExp(escapeTokenRegex(s3Copy), 'g');
    const matches = userData.match(regex) ?? [];

    // THEN
    // The source of the asset copy should be identical from installer1 & installer2
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe(matches[1]);
  });
});