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
  SecurityGroup,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import * as fsx from '@aws-cdk/aws-fsx';
import {
  App,
  Stack,
} from '@aws-cdk/core';

import {
  MountableFsxLustre,
  MountPermissions,
} from '../lib';

import {
  escapeTokenRegex,
} from './token-regex-helpers';

describe('MountableFsxLustre', () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let fs: fsx.LustreFileSystem;
  let fsSecurityGroup: SecurityGroup;
  let instance: Instance;
  let instanceSecurityGroup: SecurityGroup;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app);
    vpc = new Vpc(stack, 'Vpc');
    fsSecurityGroup = new SecurityGroup(stack, 'FSxLSecurityGroup', {
      vpc,
    });
    fs = new fsx.LustreFileSystem(stack, 'FSxL', {
      vpc,
      vpcSubnet: vpc.privateSubnets[0],
      lustreConfiguration: {
        deploymentType: fsx.LustreDeploymentType.SCRATCH_1,
      },
      storageCapacityGiB: 1200,
      securityGroup: fsSecurityGroup,
    });
    instanceSecurityGroup = new SecurityGroup(stack, 'InstanceSecurityGroup', {
      vpc,
    });
    instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      securityGroup: instanceSecurityGroup,
    });
  });

  test('mounts with defaults', () => {
    // GIVEN
    const mount = new MountableFsxLustre(fs, {
      filesystem: fs,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
    });
    const userData = instance.userData.render();

    // THEN
    // Make sure the instance has been granted ingress to the FSxL's security group
    cdkExpect(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 988,
      ToPort: 1023,
      SourceSecurityGroupId: stack.resolve(instanceSecurityGroup.securityGroupId),
      GroupId: stack.resolve(fsSecurityGroup.securityGroupId),
    }));
    // Make sure we download the mountFsxLustre script asset bundle
    const s3Copy = 'aws s3 cp \'s3://${Token[TOKEN.\\d+]}/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\' \'/tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}\'';
    expect(userData).toMatch(new RegExp(escapeTokenRegex(s3Copy)));
    expect(userData).toMatch(new RegExp(escapeTokenRegex('unzip /tmp/${Token[TOKEN.\\d+]}${Token[TOKEN.\\d+]}')));
    // Make sure we install the Lustre client
    expect(userData).toMatch('bash ./installLustreClient.sh');
    // Make sure we execute the script with the correct args
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountFsxLustre.sh ${Token[TOKEN.\\d+]} /mnt/fsx/fs1 ${Token[TOKEN.\\d+]} rw')));
  });

  test('assert Linux-only', () => {
    // GIVEN
    const windowsInstance = new Instance(stack, 'WindowsInstance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_SQL_2017_STANDARD),
    });
    const mount = new MountableFsxLustre(fs, {
      filesystem: fs,
    });

    // THEN
    expect(() => {
      mount.mountToLinuxInstance(windowsInstance, {
        location: '/mnt/fsx/fs1',
        permissions: MountPermissions.READONLY,
      });
    }).toThrowError('Target instance must be Linux.');
  });

  test('readonly mount', () => {
    // GIVEN
    const mount = new MountableFsxLustre(fs, {
      filesystem: fs,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
      permissions: MountPermissions.READONLY,
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountFsxLustre.sh ${Token[TOKEN.\\d+]} /mnt/fsx/fs1 ${Token[TOKEN.\\d+]} r')));
  });

  test('extra mount options', () => {
    // GIVEN
    const mount = new MountableFsxLustre(fs, {
      filesystem: fs,
      extraMountOptions: [
        'option1',
        'option2',
      ],
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountFsxLustre.sh ${Token[TOKEN.\\d+]} /mnt/fsx/fs1 ${Token[TOKEN.\\d+]} rw,option1,option2')));
  });

  test('asset is singleton', () => {
    // GIVEN
    const mount1 = new MountableFsxLustre(fs, {
      filesystem: fs,
    });
    const mount2 = new MountableFsxLustre(fs, {
      filesystem: fs,
    });

    // WHEN
    mount1.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
    });
    mount2.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
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

  test('applies Lustre fileset', () => {
    // GIVEN
    const fileset = 'fileset';
    const mount = new MountableFsxLustre(fs, {
      filesystem: fs,
      fileset,
    });

    // WHEN
    mount.mountToLinuxInstance(instance, {
      location: '/mnt/fsx/fs1',
    });
    const userData = instance.userData.render();

    // THEN
    expect(userData).toMatch(new RegExp(escapeTokenRegex(`bash ./mountFsxLustre.sh \${Token[TOKEN.\\d+]} /mnt/fsx/fs1 \${Token[TOKEN.\\d+]}/${fileset} rw`)));
  });
});
