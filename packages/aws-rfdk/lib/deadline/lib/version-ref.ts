/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IBucket } from '@aws-cdk/aws-s3';
import { Version } from './version';

/**
 * This interface represents a deadline installer object stored on
 * an S3 bucket.
 */
export interface Installer {
  /**
   * The S3 Bucket interface where the installer is located.
   */
  readonly s3Bucket: IBucket;

  /**
   * The object key where the installer file is located.
   */
  readonly objectKey: string;
}

/**
 * This interface represents a collection of Deadline installer files for a specific Deadline version stored in S3.
 */
export interface PlatformInstallers {
  /**
   * The patch version for these Deadline installers.
   * ex: If the installer is for version 10.1.8.5, then this will be 5.
   */
  readonly patchVersion: number;

  /**
   * The Deadline Repository installer for this platform, as extracted from the bundle on the Thinkbox download site.
   * For example:
   *
   * - DeadlineRepository-10.1.8.5-linux-x64-installer.run
   * - DeadlineRepository-10.1.8.5-windows-installer.exe
   */
  readonly repository: Installer;
}

/**
 * Represents a release of Deadline up to and including the third (release)
 * component of the version.
 *
 * E.g. 10.1.9
 */
export interface IReleaseVersion {
  /**
   * The major version number.
   */
  readonly majorVersion: number;

  /**
   * The minor version number.
   */
  readonly minorVersion: number;

  /**
   * The release version number.
   */
  readonly releaseVersion: number;

  /**
   * A string representation of the version using the best available information at synthesis-time.
   *
   * This value is not guaranteed to be resolved, and is intended for output to CDK users.
   */
  readonly versionString: string;

  /**
   * Returns whether this version is less than another version
   *
   * @param other Other version to be compared
   */
  isLessThan(other: Version): boolean;
}

/**
 * Represents a fully-qualified release version number
 *
 * E.g. 10.1.9.2
 */
export interface IPatchVersion extends IReleaseVersion {
  /**
   * The patch version number.
   */
  readonly patchVersion: number;
}

/**
 * This interface represents a deadline version. It contains the
 * major, minor, and release numbers essential to identify
 * a version. It also includes the S3 path of the installers.
 *
 * The Deadline version tag consists of four numbers:
 * Major.Minor.Release.Patch
 */
export interface IVersion extends IReleaseVersion {
  /**
   * The Linux installers for this version.
   *
   * @default No installers for Linux are provided.
   */
  readonly linuxInstallers: PlatformInstallers;

  /**
   * Construct the full version string for the linux patch release referenced in
   * this version object. This is constructed by joining the major, minor,
   * release, and patch versions by dots.
   */
  linuxFullVersionString(): string;
}
