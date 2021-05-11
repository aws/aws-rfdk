/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Version,
} from '../lib';

describe('Version', () => {
  describe('.isGreaterThan', () => {
    test.each<[string, { firstVersion: string, secondVersion: string, expectedValue: boolean }]>([
      [
        'equal version',
        {
          firstVersion: '1.1.1.1',
          secondVersion: '1.1.1.1',
          expectedValue: false,
        },
      ], [
        'less than',
        {
          firstVersion: '10.0.9.2',
          secondVersion: '10.1.9.2',
          expectedValue: false,
        },
      ], [
        'less than',
        {
          firstVersion: '1.1.1.1',
          secondVersion: '1.1.1.2',
          expectedValue: false,
        },
      ], [
        'greater than',
        {
          firstVersion: '2.0.0.1',
          secondVersion: '2.0.0.0',
          expectedValue: true,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { firstVersion, secondVersion, expectedValue } = testcase;

      // WHEN
      const lhs = Version.parse(firstVersion);
      const result = lhs.isGreaterThan(Version.parse(secondVersion));

      expect(result).toEqual(expectedValue);
    });
  });

  test('.isGreaterThan constructor', () => {
    // WHEN
    const lhs = new Version([10, 1, 9, 2]);
    const result = lhs.isGreaterThan(Version.parse('10.0.9.2'));

    expect(result).toEqual(true);
  });

  describe('.isLessThan', () => {
    test.each<[string, { firstVersion: string, secondVersion: string, expectedValue: boolean }]>([
      [
        'equal version',
        {
          firstVersion: '1.1.1.1',
          secondVersion: '1.1.1.1',
          expectedValue: false,
        },
      ], [
        'greater minor version',
        {
          firstVersion: '10.1.9.2',
          secondVersion: '10.0.9.2',
          expectedValue: false,
        },
      ], [
        'greater patch version',
        {
          firstVersion: '1.1.1.2',
          secondVersion: '1.1.1.1',
          expectedValue: false,
        },
      ], [
        'less than',
        {
          firstVersion: '2.0.0.0',
          secondVersion: '2.0.0.1',
          expectedValue: true,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { firstVersion, secondVersion, expectedValue } = testcase;

      // WHEN
      const lhs = Version.parse(firstVersion);
      const result = lhs.isLessThan(Version.parse(secondVersion));

      expect(result).toEqual(expectedValue);
    });
  });

  describe('.isEqual', () => {
    test.each<[string, { firstVersion: string, secondVersion: string, expectedValue: boolean }]>([
      [
        'equal version',
        {
          firstVersion: '1.1.1.1',
          secondVersion: '1.1.1.1',
          expectedValue: true,
        },
      ], [
        'unequal',
        {
          firstVersion: '2.1.1.1',
          secondVersion: '1.1.1.1',
          expectedValue: false,
        },
      ], [
        'less than',
        {
          firstVersion: '1.1.1.1',
          secondVersion: '1.1.1.2',
          expectedValue: false,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { firstVersion, secondVersion, expectedValue } = testcase;

      // WHEN
      const lhs = Version.parse(firstVersion);
      const result = lhs.isEqual(Version.parse(secondVersion));

      expect(result).toEqual(expectedValue);
    });
  });

  test('.isLessThan using constructor', () => {
    // WHEN
    const lhs = new Version([10, 0, 9, 2]);
    const result = lhs.isLessThan(Version.parse('10.1.9.2'));

    expect(result).toEqual(true);
  });

  describe('throws exception for invalid components', () => {
    test.each<[string, { version: number[], expectedException: RegExp }]>([
      [
        'incorrect component count',
        {
          version: [10, 1, 9],
          expectedException: /Invalid version format. Version should contain exactly 4 components./,
        },
      ], [
        'negative value',
        {
          version: [10, -1, 9, 2],
          expectedException: /Invalid version format. None of the version components can be negative./,
        },
      ], [
        'decimal value',
        {
          version: [10, 1, 9.2, 2],
          expectedException: /Invalid version format. None of the version components can contain decimal values./,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { version, expectedException } = testcase;

      // WHEN
      expect(() => new Version(version)).toThrow(expectedException);
    });
  });

  describe('components are mapped to correct properties', () => {
    // GIVEN
    const versionComponents = [10, 1, 9, 2];
    let version: Version;

    // WHEN
    beforeEach(() => {
      version = new Version(versionComponents);
    });

    // THEN
    test('majorVersion', () => {
      expect(version.majorVersion).toEqual(versionComponents[0]);
    });

    test('minorVersion', () => {
      expect(version.minorVersion).toEqual(versionComponents[1]);
    });

    test('releaseVersion', () => {
      expect(version.releaseVersion).toEqual(versionComponents[2]);
    });

    test('patchVersion', () => {
      expect(version.patchVersion).toEqual(versionComponents[3]);
    });
  });

  describe('.parse throws exception', () => {
    test.each<[string, { version: string, expectedException?: RegExp }]>([
      [
        'ending with .',
        {
          version: '10.1.9.',
          expectedException: /Invalid version format/,
        },
      ], [
        'empty string',
        {
          version: '',
          expectedException: /Invalid version format/,
        },
      ], [
        'negative value',
        {
          version: '10.-1.9.2',
          expectedException: /Invalid version format/,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { version, expectedException } = testcase;

      // WHEN
      expect(() => Version.parse(version)).toThrow(expectedException);
    });
  });

  test('.parse() works', () => {
    // GIVEN
    const versionString = '10.1.9.2';

    // WHEN
    const version = Version.parse(versionString);

    // THEN
    expect(version.majorVersion).toBe(10);
    expect(version.minorVersion).toBe(1);
    expect(version.releaseVersion).toBe(9);
    expect(version.patchVersion).toBe(2);
  });
});
