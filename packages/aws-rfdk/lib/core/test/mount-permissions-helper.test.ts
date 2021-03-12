/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MountPermissions,
} from '../lib';
import {
  MountPermissionsHelper,
} from '../lib/mount-permissions-helper';

test.each([
  [MountPermissions.READONLY, 'ro'],
  [MountPermissions.READWRITE, 'rw'],
  [undefined, 'rw'],
])('toLinuxMountOption test: %p', (permission, expected) => {
  expect(MountPermissionsHelper.toLinuxMountOption(permission)).toBe(expected);
});

test.each<[MountPermissions | undefined, string[]]>([
  [
    MountPermissions.READONLY,
    [
      'elasticfilesystem:ClientMount',
    ],
  ],
  [
    MountPermissions.READWRITE,
    [
      'elasticfilesystem:ClientMount',
      'elasticfilesystem:ClientWrite',
    ],
  ],
  [
    undefined,
    [
      'elasticfilesystem:ClientMount',
      'elasticfilesystem:ClientWrite',
    ],
  ],
])('toEfsIAMActions test: %p', (permission, expected) => {
  expect(MountPermissionsHelper.toEfsIAMActions(permission)).toEqual(expected);
});

