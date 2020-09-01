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
   * 0 if the versions matches, positive value if first version is greater
   * than second version.
   */
  public static versionCompare(versionFirst: string, versionSecond: string): number {
    const regExStripZero = /(\.0+)+$/;
    const versionArrayFirst = versionFirst.replace(regExStripZero, '').split('.');
    const versionArraySecond = versionSecond.replace(regExStripZero, '').split('.');
    const minLen = Math.min(versionArrayFirst.length, versionArraySecond.length);

    for (let i = 0; i < minLen; i++) {
      const diff = parseInt(versionArrayFirst[i], 10) - parseInt(versionArraySecond[i], 10);
      if (diff) {
        return diff;
      }
    }
    return versionArrayFirst.length - versionArraySecond.length;
  }

  /**
   * This method validates the given string for a sequence '.' separated numbers.
   *
   * @param version the string to be validated.
   *
   * @returns true if the format is correct, else false.
   */
  public static validateVersionFormat(version: string): boolean {
    /**
     * Regex: ^\d+(?:\.\d+){3}$
     * Matches a sequence of '.' separated numbers with exactly 4 digits.
     * - ^ asserts position at start of a line.
     * - \d+ Matches one or more digits.
     * - (?:\.\d+) Matches a dot and the following one or more digits.
     * - * Matches previous pattern zero or more times.
     * - $ asserts position at the end of a line
     */
    if (version.match(/^\d+(?:\.\d+)*$/g)) {
      return true;
    }
    return false;
  }
}
