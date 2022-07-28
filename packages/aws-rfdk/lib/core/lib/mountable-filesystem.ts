/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IConnectable,
} from 'aws-cdk-lib/aws-ec2';
import { IConstruct } from 'constructs';

import { IScriptHost } from './script-assets';

/**
 * An instance type that can mount an {@link IMountableFilesystem}. For example, this could be an
 * {@link https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.Instance.html|EC2 Instance}
 * or an {@link https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-autoscaling.AutoScalingGroup.html|EC2 Auto Scaling Group}
 */
export interface IMountingInstance extends IConnectable, IConstruct, IScriptHost {
}

/**
 * Permission mode under which the filesystem is mounted.
 */
export enum MountPermissions {
  /**
   * Mount the filesystem as read-only.
   */
  READONLY = 'readonly',

  /**
   * Mount the filesystem as read-write.
   */
  READWRITE = 'readwrite',
}

/**
 * Properties for the mount point of a filesystem on a Linux system.
 */
export interface LinuxMountPointProps {
  /**
   * Directory for the mount point.
   */
  readonly location: string;

  /**
   * File permissions for the mounted filesystem.
   *
   * @default MountPermissions.READWRITE
   */
  readonly permissions?: MountPermissions;
}

/**
 * A filesystem that can be mounted onto a Linux system.
 */
export interface IMountableLinuxFilesystem {
  /**
   * Mount the filesystem to the given instance at instance startup. This is accomplished by
   * adding scripting to the UserData of the instance to mount the filesystem on startup.
   * If required, the instance's security group is granted ingress to the filesystem's security
   * group on the required ports.
   * @param target Target instance to mount the filesystem to.
   * @param mount  The directory, or drive letter, to mount the filesystem to.
   */
  mountToLinuxInstance(target: IMountingInstance, mount: LinuxMountPointProps): void;

  /**
   * Returns whether the mounted file-system evaluates the UID/GID of the system user accessing the file-system.
   *
   * Some network file-systems provide features to fix a UID/GID for all access to the mounted file-system and ignore
   * the system user accessing the file. If this is the case, an implementing class must indicate this in the return
   * value.
   */
  usesUserPosixPermissions(): boolean;
}
