/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class Utils {
  /**
   * This method compares two version strings
   *
   * @param versionFirst
   * @param versionSecond
   *
   * @returns negative value if first version is smaller than second version;
   * 0 if the versions matches, positive value if first version is smaller
   * than second version.
   */
  public static versionCompare(versionFirst: string, versionSecond: string): number {
    const regExStripZero = /(\.0+)+$/;
    const versionArrayFirst = versionFirst.replace(regExStripZero, '').split('.');
    const versionArraySecond = versionSecond.replace(regExStripZero, '').split('.');
    const l = Math.min(versionArrayFirst.length, versionArraySecond.length);

    for (let i = 0; i < l; i++) {
      let diff = parseInt(versionArrayFirst[i], 10) - parseInt(versionArraySecond[i], 10);
      if (diff) {
        return diff;
      }
    }
    return versionArrayFirst.length - versionArraySecond.length;
  }
}