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
import * as efs from '@aws-cdk/aws-efs';
import {
  Stack,
} from '@aws-cdk/core';

import {
  MountableEfs,
  MountPermissions,
} from '../lib';

import {
  escapeTokenRegex,
} from './token-regex-helpers';

describe('Test MountableEFS', () => {
  let stack: Stack;
  let vpc: Vpc;
  let efsFS: efs.FileSystem;
  let instance: Instance;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    efsFS = new efs.FileSystem(stack, 'EFS', { vpc });
    instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
  });

  test('defaults', () => {
    // GIVEN
    const mount = new MountableEfs(efsFS, {
      filesystem: efsFS,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/efs/fs1',
    });
    const userData = instance.userData.render();
    // THEN

    // Make sure the instance has been granted ingress to the EFS's security group
    cdkExpect(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 2049,
      ToPort: 2049,
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'InstanceInstanceSecurityGroupF0E2D5BE',
          'GroupId',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          'EFSEfsSecurityGroup56F189CE',
          'GroupId',
        ],
      },
    }));
    // Make sure we download the mountEfs script asset bundle
    const s3Copy = 'aws s3 cp \'s3://${Token[TOKEN.\\d+]}/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \'/tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\'';
    expect(userData).toMatch(new RegExp(escapeTokenRegex(s3Copy)));
    expect(userData).toMatch(new RegExp(escapeTokenRegex('unzip /tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}')));
    // Make sure we execute the script with the correct args
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 rw')));
  });

  test('assert Linux-only', () => {
    // GIVEN
    const windowsInstance = new Instance(stack, 'WindowsInstance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_SQL_2017_STANDARD),
    });
    const mount = new MountableEfs(efsFS, {
      filesystem: efsFS,
    });

    // THEN
    expect(() => {
      mount.mountToLinuxInstance(windowsInstance, {
        location: '/mnt/efs/fs1',
        permissions: MountPermissions.READONLY,
      });
    }).toThrowError('Target instance must be Linux.');
  });

  test('readonly mount', () => {
    // GIVEN
    const mount = new MountableEfs(efsFS, {
      filesystem: efsFS,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/efs/fs1',
      permissions: MountPermissions.READONLY,
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 r')));
  });

  test('extra mount options', () => {
    // GIVEN
    const mount = new MountableEfs(efsFS, {
      filesystem: efsFS,
      extraMountOptions: [
        'option1',
        'option2',
      ],
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/efs/fs1',
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 rw,option1,option2')));
  });

  test('asset is singleton', () => {
    // GIVEN
    const mount1 = new MountableEfs(efsFS, {
      filesystem: efsFS,
    });
    const mount2 = new MountableEfs(efsFS, {
      filesystem: efsFS,
    });

    // WHEN
    mount1.mountToLinuxInstance(instance, {
      location: '/mnt/efs/fs1',
    });
    mount2.mountToLinuxInstance(instance, {
      location: '/mnt/efs/fs1',
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
