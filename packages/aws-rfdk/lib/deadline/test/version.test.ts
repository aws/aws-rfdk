/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResource,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  Stack,
} from '@aws-cdk/core';
import {
  IVersion,
  Version,
  VersionQuery,
} from '../lib';

let stack: Stack;

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
          expectedException: /Invalid version format/,
        },
      ], [
        'negative value',
        {
          version: [10, -1, 9],
          expectedException: /Invalid version format/,
        },
      ], [
        'decimal value',
        {
          version: [10, 1, 9.2],
          expectedException: /Invalid version format/,
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
        expect(() => new Version(version)).not.toThrow();
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

describe('VersionQuery', () => {
  beforeEach(() => {
    stack = new Stack(undefined, undefined);
  });

  describe('constructor', () => {
    test('throws not implemented error for empty version string', () => {
      // WHEN
      expect(() => {
        new VersionQuery(stack, 'version', {
          version: '',
        });
      }).toThrowError(/MethodNotSupportedException: This method is currently not implemented./);

      // THEN
      expectCDK(stack).notTo(haveResource('AWS::Lambda::Function'));
      expectCDK(stack).notTo(haveResourceLike('AWS::CloudFormation::CustomResource', {
        DeadlineVersion: '',
      }));
    });

    test('throws not implemented error for valid version string', () => {
      // WHEN
      expect(() => {
        new VersionQuery(stack, 'version', {
          version: '1.2',
        });
      }).toThrowError(/MethodNotSupportedException: This method is currently not implemented./);

      // THEN
      expectCDK(stack).notTo(haveResource('AWS::Lambda::Function'));
      expectCDK(stack).notTo(haveResourceLike('AWS::CloudFormation::CustomResource', {
        DeadlineVersion: '1.2',
      }));
    });

    test('throws not implemented error without props', () => {
      // WHEN
      expect(() => {
        new VersionQuery(stack, 'version');
      }).toThrowError(/MethodNotSupportedException: This method is currently not implemented./);

      // THEN
      expectCDK(stack).notTo(haveResource('AWS::Lambda::Function'));
      expectCDK(stack).notTo(haveResourceLike('AWS::CloudFormation::CustomResource'));
      expectCDK(stack).notTo(haveResourceLike('AWS::CloudFormation::CustomResource', {
        DeadlineVersion: '',
      }));
    });
  });

  // GIVEN
  const majorVersion = 1;
  const minorVersion = 2;
  const releaseVersion = 3;
  const patchVersion = 4;
  const expectedVersionString = `${majorVersion}.${minorVersion}.${releaseVersion}.${patchVersion}`;

  let version: IVersion;

  function exactVersionTests() {
    test('does not create a custom resource', () => {
      // THEN
      expectCDK(stack).notTo(haveResourceLike('AWS::CloudFormation::CustomResource'));
    });

    test('does not create a lambda', () => {
      // THEN
      expectCDK(stack).notTo(haveResource('AWS::Lambda::Function'));
    });

    test('populates version components', () => {
      // THEN
      expect(version.majorVersion).toEqual(1);
      expect(version.minorVersion).toEqual(2);
      expect(version.releaseVersion).toEqual(3);
    });

    test('provides linux installers', () => {
      // GIVEN
      const linuxFullVersionString = version.linuxFullVersionString();

      // THEN
      expect(version.linuxInstallers).toBeDefined();
      expect(linuxFullVersionString).toBeDefined();
      expect(linuxFullVersionString).toMatch(expectedVersionString);

      expect(version.linuxInstallers!.repository).toBeDefined();
      expect(version.linuxInstallers!.repository!.s3Bucket.bucketName).toMatch('thinkbox-installers');
      expect(version.linuxInstallers!.repository!.objectKey).toMatch(`DeadlineRepository-${expectedVersionString}-linux-x64-installer.run`);
    });
  }

  describe('.exact()', () => {
    beforeEach(() => {
      version = VersionQuery.exact(stack, 'version', {
        majorVersion,
        minorVersion,
        releaseVersion,
        patchVersion,
      });
    });

    exactVersionTests();
  });

  describe('.exactString()', () => {
    beforeEach(() => {
      version = VersionQuery.exactString(stack, 'version', expectedVersionString);
    });

    exactVersionTests();

    test.each([
      [''],
      ['abc'],
      ['1'],
      ['1.2'],
      ['1.2.3'],
      ['1.2.3.4a'],
      ['a1.2.3.4a'],
      ['a1.2.3.4'],
      [' 1.2.3.4 '],
      ['a.b.c.d'],
      ['-1.0.2.3'],
      ['.1.0.2.3'],
    ])('throws an error on invalid versions %p', (versionStr: string) => {
      // WHEN
      function when() {
        VersionQuery.exactString(stack, 'version', versionStr);
      }

      // THEN
      expect(when).toThrowError(new RegExp(`^Invalid version format. Expected format 'a.b.c.d', found '${versionStr}'$`));
    });
  });
});
