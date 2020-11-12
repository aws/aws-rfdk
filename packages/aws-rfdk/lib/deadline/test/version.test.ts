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

  describe('.isGreaterThan constructor', () => {

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

  describe('.isLessThan using constructor', () => {

    // WHEN
    const lhs = new Version([10, 0, 9, 2]);
    const result = lhs.isLessThan(Version.parse('10.1.9.2'));

    expect(result).toEqual(true);
  });

  describe('constructor validation', () => {
    test.each<[string, { version: number[], expectedException?: RegExp }]>([
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
      ], [
        'correct value',
        {
          version: [10, 1, 9, 2],
        },
      ],
    ])('%s', (_name, testcase) => {
      const { version, expectedException } = testcase;

      // WHEN
      if (expectedException) {
        expect(() => new Version(version)).toThrow(expectedException);
      } else {
        const versionObj = new Version(version);
        expect(versionObj.majorVersion).toEqual(version[0]);
        expect(versionObj.minorVersion).toEqual(version[1]);
        expect(versionObj.releaseVersion).toEqual(version[2]);
        expect(versionObj.patchVersion).toEqual(version[3]);
      }
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
      ], [
        'correct version',
        {
          version: '10.1.9.2',
        },
      ],
    ])('%s', (_name, testcase) => {
      const { version, expectedException } = testcase;

      // WHEN
      if(expectedException) {
        expect(() => Version.parse(version)).toThrow(expectedException);
      } else {
        expect(() => Version.parse(version)).not.toThrow();
      }
    });
  });
});
