/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility class for validating and converting the version number to or from a version string
 */
export class Version {
  public static validateVersionString(versionString: string): boolean {
    if (null === this.parseFromVersionString(versionString))  { return false; }
    return true;
  }

  public static parseFromVersionString(versionString: string): RegExpExecArray | null {
    return Version.VALID_VERSION_REGEX.exec(versionString);
  }

  public static convertToFullVersionString(major: string, minor: string, release: string, patch: string): string {
    const majorNumber = Number(major);
    const minorNumber = Number(minor);
    const releaseNumber = Number(release);
    const patchNumber = Number(patch);

    if (isNaN(majorNumber) || majorNumber < 0
      || isNaN(minorNumber) || minorNumber < 0
      || isNaN(releaseNumber) || releaseNumber < 0
      || isNaN(patchNumber) || patchNumber < 0) {
      throw new Error(`A component of the version was not in the correct format: ${major}.${minor}.${release}.${patch}`);
    }
    return `${major}.${minor}.${release}.${patch}`;
  }

  private static readonly VALID_VERSION_REGEX = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/;
}
