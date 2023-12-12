/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  Instance,
  InstanceType,
  MachineImage,
  Vpc,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';

import {
  MongoDbInstaller,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
} from '../lib';
import {
  INSTALL_MONGODB_3_6_SCRIPT_LINUX,
} from './asset-constants';


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
    }).toThrow(errorString);
    // Must throw when explicitly rejecting the SSPL.
    expect(() => {
      new MongoDbInstaller(stack, {
        version: MongoDbVersion.COMMUNITY_3_6,
        userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL,
      });
    }).toThrow(errorString);

  });

  test('linux installation', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux2(),
    });
    const installer = new MongoDbInstaller(stack, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance: MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL,
    });

    // WHEN
    installer.installOnLinuxInstance(instance);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
                      'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
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
                      'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
                    },
                    '/*',
                  ],
                ],
              },
            ],
          },
        ],
      },
    });
    // Make sure we download and run the mongo install script
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `#!/bin/bash\nmkdir -p $(dirname '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
              },
              `/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh' '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh'\nbash /tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh`,
            ],
          ],
        },
      },
    });
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
    }).toThrow('Target instance must be Linux.');
  });

  test('asset is singleton', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux2(),
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

    // THEN
    // The source of the asset copy should be identical from installer1 & installer2
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            Match.arrayWith([
              `#!/bin/bash\nmkdir -p $(dirname '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
              },
              `/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh' '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh'\nbash /tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh\nmkdir -p $(dirname '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': INSTALL_MONGODB_3_6_SCRIPT_LINUX.Bucket,
              },
              `/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh' '/tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh'\nbash /tmp/${INSTALL_MONGODB_3_6_SCRIPT_LINUX.Key}.sh`,
            ]),
          ],
        },
      },
    });
  });
});
