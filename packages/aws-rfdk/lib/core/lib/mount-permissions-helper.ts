/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MountPermissions,
} from './mountable-filesystem';

/**
 * This is an internal-only class that can be used to convert enum values from
 * {@link MountPermissions} into strings, or whatever, that are needed by OS-specific
 * mount utilities.
 */
export class MountPermissionsHelper {

  /**
   * Convert the given permission into the appropriate mount option for Linux's mount command.
   *
   * @param permission The permission to convert. Defaults to {@link MountPermissions.READWRITE} if not defined.
   */
  public static toLinuxMountOption(permission?: MountPermissions): string {
    permission = permission ?? MountPermissions.READWRITE;
    switch (permission) {
      case MountPermissions.READONLY:
        return 'ro';
      case MountPermissions.READWRITE:
        return 'rw';
    }
    throw new Error(`Unhandled MountPermission: ${permission}`);
  }
}