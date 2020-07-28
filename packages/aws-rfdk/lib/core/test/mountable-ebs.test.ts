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
  Volume,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  Size,
  Stack,
} from '@aws-cdk/core';

import {
  BlockVolumeFormat,
  IMountingInstance,
  MountableBlockVolume,
  MountPermissions,
} from '../lib';

import {
  MOUNT_EBS_SCRIPT_LINUX,
} from './asset-constants';
import {
  escapeTokenRegex,
} from './token-regex-helpers';

describe('Test MountableBlockVolume', () => {
  let stack: Stack;
  let vpc: Vpc;
  let ebsVol: Volume;
  let instance: Instance;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    ebsVol = new Volume(stack, 'EBS', {
      availabilityZone: vpc.availabilityZones[0],
      size: Size.gibibytes(5),
    });
    instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
  });

  test('defaults', () => {
    // GIVEN
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
    });
    const userData = instance.userData.render();
    // THEN

    // Make sure the instance role has the correct permissions to get & run the script
    cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'ec2:DescribeVolumes',
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: 'ec2:AttachVolume',
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':ec2:',
                    {
                      Ref: 'AWS::Region',
                    },
                    ':',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ':volume/',
                    {
                      Ref: 'EBSB2DACE72',
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
                    ':ec2:',
                    {
                      Ref: 'AWS::Region',
                    },
                    ':',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ':instance/*',
                  ],
                ],
              },
            ],
            Condition: {
              'ForAnyValue:StringEquals': {
                'ec2:ResourceTag/VolumeGrantAttach-a47ec0afb147979ebdf4265080024b2c': 'd9a17c1c9e8ef6866e4dbeef41c741b2',
              },
            },
          },
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
                      Ref: MOUNT_EBS_SCRIPT_LINUX.Bucket,
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
                      Ref: MOUNT_EBS_SCRIPT_LINUX.Bucket,
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
    expect(userData).toMatch(new RegExp(escapeTokenRegex('unzip /tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}')));
    // Make sure we execute the script with the correct args
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEbsBlockVolume.sh ${Token[TOKEN.\\d+]} xfs /mnt/fs rw')));
  });

  test('assert Linux-only', () => {
    // GIVEN
    const windowsInstance = new Instance(stack, 'WindowsInstance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_SQL_2017_STANDARD),
    });
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });

    // THEN
    expect(() => {
      mount.mountToLinuxInstance(windowsInstance, {
        location: '/mnt/fs',
        permissions: MountPermissions.READONLY,
      });
    }).toThrowError('Target instance must be Linux.');
  });

  test('readonly mount', () => {
    // GIVEN
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
      permissions: MountPermissions.READONLY,
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEbsBlockVolume.sh ${Token[TOKEN.\\d+]} xfs /mnt/fs r')));
  });

  test('non-default filesystem type', () => {
    // GIVEN
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
      volumeFormat: BlockVolumeFormat.EXT4,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
      permissions: MountPermissions.READONLY,
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEbsBlockVolume.sh ${Token[TOKEN.\\d+]} ext4 /mnt/fs r')));
  });

  test('extra mount options', () => {
    // GIVEN
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
      extraMountOptions: [
        'option1',
        'option2',
      ],
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEbsBlockVolume.sh ${Token[TOKEN.\\d+]} xfs /mnt/fs rw,option1,option2')));
  });

  test('fails if non-construct target', () => {
    // GIVEN
    const mount = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });

    // WHEN
    class FakeTarget implements IMountingInstance {
      public readonly connections = instance.connections;
      public readonly osType = instance.osType;
      public readonly userData = instance.userData;
      public readonly grantPrincipal = instance.grantPrincipal;
    }
    const fakeTarget = new FakeTarget();

    // THEN
    expect(() => {
      mount.mountToLinuxInstance(fakeTarget, {
        location: '/mnt/fs',
        permissions: MountPermissions.READONLY,
      });
    }).toThrowError(/Target instance must be a construct./);
  });

  test('asset is singleton', () => {
    // GIVEN
    const mount1 = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });
    const mount2 = new MountableBlockVolume(ebsVol, {
      blockVolume: ebsVol,
    });

    // WHEN
    mount1.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
    });
    mount2.mountToLinuxInstance(instance, {
      location: '/mnt/fs',
    });
    const userData = instance.userData.render();
    const s3Copy = 'aws s3 cp \'s3://${Token[TOKEN.\\d+]}/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\'';
    const regex = new RegExp(escapeTokenRegex(s3Copy), 'g');
    const matches = userData.match(regex) ?? [];

    // THEN
    // The source of the asset copy should be identical from mount1 & mount2
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe(matches[1]);
  });
});
