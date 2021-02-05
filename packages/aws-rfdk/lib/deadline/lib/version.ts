/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IPatchVersion,
} from './version-ref';

/**
  * This class is reposonsible to do basic operations on version format.
  */
export class Version implements IPatchVersion {

  /**
   * This variable holds the value for minimum supported deadline version.
   */
  public static readonly MINIMUM_SUPPORTED_DEADLINE_VERSION = new Version([10, 1, 9, 2]);

  /**
   * This method parses the input string and returns the version object.
   *
   * @param version version string to parse
   */
  public static parse(version: string): Version {
    if (!Version.validateVersionFormat(version)) {
      throw new TypeError(`Invalid version format. Expected format 'a.b.c.d', found '${version}'`);
    }

    return new Version(version.split('.').map(x => parseInt(x)));
  }

  /**
   * This method validates the given string for a sequence '.' separated numbers.
   *
   * @param version the string to be validated.
   *
   * @returns true if the format is correct, else false.
   */
  private static validateVersionFormat(version: string): boolean {
    /**
     * Regex: ^\d+(?:\.\d+){3}$
     * Matches a sequence of '.' separated numbers with exactly 4 digits.
     * - ^ asserts position at start of a line.
     * - \d+ Matches one or more digits.
     * - (?:\.\d+) Matches a dot and the following one or more digits.
     * - {3} Matches previous pattern exactly 3 times.
     * - $ asserts position at the end of a line
     */
    if (version.match(/^\d+(?:\.\d+){3}$/)) {
      return true;
    }
    return false;
  }

  /**
   * Numeric components of version.
   */
  private readonly components: number[];

  /**
   * @inheritdoc
   */
  public get majorVersion(): number {
    return this.components[0];
  }

  /**
   * @inheritdoc
   */
  public get minorVersion(): number {
    return this.components[1];
  }

  /**
   * @inheritdoc
   */
  public get releaseVersion(): number {
    return this.components[2];
  }

  /**
   * @inheritdoc
   */
  public get patchVersion(): number {
    return this.components[3];
  }

  constructor(components: number[]) {
    if(components.length != 4) {
      throw new Error('Invalid version format. Version should contain exactly 4 components.');
    }
    components.forEach((component) => {
      if (component < 0) {
        throw new RangeError('Invalid version format. None of the version components can be negative.');
      }
      if (!Number.isInteger(component)) {
        throw new RangeError('Invalid version format. None of the version components can contain decimal values.');
      }
    });

    this.components = components;
  }

  /**
   * This method compares two version strings
   *
   * @param version
   *
   * @returns true if this version is greater than the provided version;
   * false if this version is less than or equal to the provided verison.
   */
  public isGreaterThan(version: Version): boolean {
    return this.compare(version) > 0;
  }

  /**
   * This method compares two version strings
   *
   * @param version
   *
   * @returns true if this version is less than the provided version;
   * false if this version is greater than or equal to the provided verison.
   */
  public isLessThan(version: Version): boolean {
    return this.compare(version) < 0;
  }

  /**
   * This method compares two version strings
   *
   * @param version
   *
   * @returns true if this version is equal to the provided version;
   * false otherwise.
   */
  public isEqual(version: Version): boolean {
    return this.compare(version) == 0;
  }

  /**
   * The method returns the version components in dot separated string format.
   */
  public toString(): string {
    return this.components.join('.');
  }

  /**
   * @inheritdoc
   */
  public get versionString(): string {
    return this.toString();
  }

  /**
   * This method compares 2 versions.
   *
   * @param version version to compare
   *
   * @returns negative value if this version is less than the provided version;
   * 0 if both the versions are equal;
   * positive value if this version is greater than the provided verison.
   */
  private compare(version: Version): number {
    if (this.components.length != version.components.length) {
      throw new TypeError('Component count in both the versions should be same.');
    }

    for (let i = 0; i < version.components.length; i++) {
      const diff = this.components[i] - version.components[i];
      if (diff != 0) {
        return diff;
      }
    }
    return 0;
  }
}
