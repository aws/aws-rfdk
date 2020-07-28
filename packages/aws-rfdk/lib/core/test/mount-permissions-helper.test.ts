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