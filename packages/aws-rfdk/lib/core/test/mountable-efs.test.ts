/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Arn,
  App,
  CfnResource,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceType,
  MachineImage,
  Vpc,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';

import {
  MountableEfs,
  MountPermissions,
} from '../lib';

import {
  MountPermissionsHelper,
} from '../lib/mount-permissions-helper';

import {
  MOUNT_EFS_SCRIPT_LINUX,
} from './asset-constants';
import {
  escapeTokenRegex,
} from './token-regex-helpers';

describe('Test MountableEFS', () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let efsFS: efs.FileSystem;
  let instance: Instance;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app);
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
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
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
    });
    // Make sure we download the mountEfs script asset bundle
    const s3Copy = `aws s3 cp 's3://\${Token[TOKEN.\\d+]}/${MOUNT_EFS_SCRIPT_LINUX.Key}.zip' '/tmp/${MOUNT_EFS_SCRIPT_LINUX.Key}.zip'`;
    expect(userData).toMatch(new RegExp(escapeTokenRegex(s3Copy)));
    expect(userData).toMatch(new RegExp(escapeTokenRegex(`unzip /tmp/${MOUNT_EFS_SCRIPT_LINUX.Key}.zip`)));
    // Make sure we execute the script with the correct args
    expect(userData).toMatch(new RegExp(escapeTokenRegex('bash ./mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 false rw')));
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
    }).toThrow('Target instance must be Linux.');
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
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 false r')));
  });

  describe.each<[MountPermissions | undefined]>([
    [undefined],
    [MountPermissions.READONLY],
    [MountPermissions.READWRITE],
  ])('access point with %s access permissions', (mountPermission) => {
    describe.each<[string, { readonly posixUser?: efs.PosixUser, readonly expectedClientRootAccess: boolean}]>([
      [
        'unspecified POSIX user',
        {
          expectedClientRootAccess: false,
        },
      ],
      [
        'resolved non-root POSIX user',
        {
          posixUser: { uid: '1000', gid: '1000' },
          expectedClientRootAccess: false,
        },
      ],
      [
        'resolved root POSIX user',
        {
          posixUser: { uid: '1000', gid: '0' },
          expectedClientRootAccess: true,
        },
      ],
      [
        'resolved root POSIX user',
        {
          posixUser: { uid: '0', gid: '1000' },
          expectedClientRootAccess: true,
        },
      ],
    ])('%s', (_name, testCase) => {
      // GIVEN
      const { posixUser, expectedClientRootAccess } = testCase;
      const expectedActions: string[] = MountPermissionsHelper.toEfsIAMActions(mountPermission);
      if (expectedClientRootAccess) {
        expectedActions.push('elasticfilesystem:ClientRootAccess');
      }
      const mountPath = '/mnt/efs/fs1';

      let userData: any;
      let accessPoint: efs.AccessPoint;
      let expectedMountMode: string;

      beforeEach(() => {
        // GIVEN
        accessPoint = new efs.AccessPoint(stack, 'AccessPoint', {
          fileSystem: efsFS,
          posixUser,
        });
        const mount = new MountableEfs(efsFS, {
          filesystem: efsFS,
          accessPoint,
        });
        expectedMountMode = (mountPermission === MountPermissions.READONLY) ? 'ro' : 'rw';

        // WHEN
        mount.mountToLinuxInstance(instance, {
          location: mountPath,
          permissions: mountPermission,
        });
        userData = stack.resolve(instance.userData.render());
      });

      test('userdata specifies access point when mounting', () => {
        // THEN
        expect(userData).toEqual({
          'Fn::Join': [
            '',
            expect.arrayContaining([
              expect.stringMatching(new RegExp('(\\n|^)bash \\./mountEfs.sh $')),
              stack.resolve(efsFS.fileSystemId),
              ` ${mountPath} false ${expectedMountMode},iam,accesspoint=`,
              stack.resolve(accessPoint.accessPointId),
              expect.stringMatching(/^\n/),
            ]),
          ],
        });
      });

      test('grants IAM access point permissions', () => {
        Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              {
                Action: expectedActions.length === 1 ? expectedActions[0] : expectedActions,
                Condition: {
                  StringEquals: {
                    'elasticfilesystem:AccessPointArn': stack.resolve(accessPoint.accessPointArn),
                  },
                },
                Effect: 'Allow',
                Resource: stack.resolve((efsFS.node.defaultChild as efs.CfnFileSystem).attrArn),
              },
            ]),
            Version: '2012-10-17',
          }),
          Roles: Match.arrayWith([
            // The Policy construct micro-optimizes the reference to a role in the same stack using its logical ID
            stack.resolve((instance.role.node.defaultChild as CfnResource).ref),
          ]),
        });
      });
    });
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
    expect(userData).toMatch(new RegExp(escapeTokenRegex('mountEfs.sh ${Token[TOKEN.\\d+]} /mnt/efs/fs1 false rw,option1,option2')));
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
    const s3Copy = `aws s3 cp 's3://\${Token[TOKEN.\\d+]}/${MOUNT_EFS_SCRIPT_LINUX.Key}.zip'`;
    const regex = new RegExp(escapeTokenRegex(s3Copy), 'g');
    const matches = userData.match(regex) ?? [];

    // THEN
    // The source of the asset copy should be identical from mount1 & mount2
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe(matches[1]);
  });

  describe('resolves mount target using API', () => {
    describe.each<[string, () => efs.AccessPoint | undefined]>([
      ['with access point', () => {

        return new efs.AccessPoint(stack, 'AccessPoint', {
          fileSystem: efsFS,
          posixUser: {
            gid: '1',
            uid: '1',
          },
        });
      }],
      ['without access point', () => undefined],
    ])('%s', (_, getAccessPoint) => {
      let accessPoint: efs.AccessPoint | undefined;

      beforeEach(() => {
        // GIVEN
        accessPoint = getAccessPoint();
        const mountable = new MountableEfs(efsFS, {
          filesystem: efsFS,
          accessPoint,
          resolveMountTargetDnsWithApi: true,
        });

        // WHEN
        mountable.mountToLinuxInstance(instance, {
          location: '/mnt/efs',
        });
      });

      test('grants DescribeMountTargets permission', () => {
        const expectedResources = [
          stack.resolve((efsFS.node.defaultChild as efs.CfnFileSystem).attrArn),
        ];
        if (accessPoint) {
          expectedResources.push(stack.resolve(accessPoint?.accessPointArn));
        }
        Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              {
                Action: 'elasticfilesystem:DescribeMountTargets',
                Effect: 'Allow',
                Resource: expectedResources.length == 1 ? expectedResources[0] : expectedResources,
              },
            ]),
          }),
          Roles: Match.arrayWith([
            stack.resolve((instance.role.node.defaultChild as CfnResource).ref),
          ]),
        });
      });
    });
  });

  describe('.usesUserPosixPermissions()', () => {
    test('access point with POSIX user returns false', () => {
      // GIVEN
      const mount = new MountableEfs(stack, {
        filesystem: efsFS,
        accessPoint: new efs.AccessPoint(stack, 'AccessPoint', {
          fileSystem: efsFS,
          posixUser: {
            uid: '1000',
            gid: '1000',
          },
        }),
      });

      // WHEN
      const usesUserPosixPermissions = mount.usesUserPosixPermissions();

      // THEN
      expect(usesUserPosixPermissions).toEqual(false);
    });

    test('access point without POSIX user returns true', () => {
      // GIVEN
      const mount = new MountableEfs(stack, {
        filesystem: efsFS,
        accessPoint: new efs.AccessPoint(stack, 'AccessPoint', {
          fileSystem: efsFS,
        }),
      });

      // WHEN
      const usesUserPosixPermissions = mount.usesUserPosixPermissions();

      // THEN
      expect(usesUserPosixPermissions).toEqual(true);
    });

    type AccessPointProvider = (stack: Stack) => efs.IAccessPoint;
    test.each<[string, AccessPointProvider]>([
      [
        'AccessPoint.fromAccessPointId(...)',
        (inputStack) => efs.AccessPoint.fromAccessPointId(inputStack, 'AccessPoint', 'accessPointId'),
      ],
      [
        'AccessPoint.fromAccessPointAttributes(...)',
        (inputStack) => {
          return efs.AccessPoint.fromAccessPointAttributes(inputStack, 'AccessPoint', {
            accessPointArn: Arn.format(
              {
                resource: 'AccessPoint',
                service: 'efs',
                resourceName: 'accessPointName',
              },
              inputStack,
            ),
            fileSystem: efsFS,
          });
        },
      ],
    ])('%s throws error', (_label, accessPointProvider) => {
      // GIVEN
      const accessPoint = accessPointProvider(stack);
      const mount = new MountableEfs(stack, {
        filesystem: efsFS,
        accessPoint,
      });

      // WHEN
      function when() {
        mount.usesUserPosixPermissions();
      }

      // THEN
      expect(when).toThrow(/^MountableEfs.usesUserPosixPermissions\(\) only supports efs.AccessPoint instances, got ".*"$/);
    });

    test('no access point returns true', () => {
      // GIVEN
      const mount = new MountableEfs(stack, {
        filesystem: efsFS,
      });

      // WHEN
      const usesUserPosixPermissions = mount.usesUserPosixPermissions();

      // THEN
      expect(usesUserPosixPermissions).toEqual(true);
    });
  });
});
