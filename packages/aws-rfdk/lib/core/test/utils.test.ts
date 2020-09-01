/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Utils } from '../lib';

describe('Utils', () => {
  describe('.versionCompare', () => {
    test.each<[string, { firstVersion: string, secondVersion: string, expectedValue: number }]>([
      [
        'equal version',
        {
          firstVersion: '1',
          secondVersion: '1',
          expectedValue: 0,
        },
      ], [
        'equal version',
        {
          firstVersion: '1',
          secondVersion: '1.0',
          expectedValue: 0,
        },
      ], [
        'equal version',
        {
          firstVersion: '1.0',
          secondVersion: '1.0.0',
          expectedValue: 0,
        },
      ], [
        'less than',
        {
          firstVersion: '1',
          secondVersion: '2',
          expectedValue: -1,
        },
      ], [
        'less than',
        {
          firstVersion: '1.2',
          secondVersion: '2',
          expectedValue: -1,
        },
      ], [
        'greater than',
        {
          firstVersion: '2.0.1',
          secondVersion: '2.0',
          expectedValue: 2,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { firstVersion, secondVersion, expectedValue } = testcase;
      // WHEN
      const result = Utils.versionCompare(firstVersion, secondVersion);

      expect(result).toEqual(expectedValue);
    });
  });

  describe('.validateVersionFormat', () => {
    test.each<[string, { version: string, expectedValue: boolean }]>([
      [
        'ending with .',
        {
          version: '10.1.9.',
          expectedValue: false,
        },
      ], [
        'empty string',
        {
          version: '',
          expectedValue: false,
        },
      ], [
        'correct version',
        {
          version: '10.1.9.2',
          expectedValue: true,
        },
      ],
    ])('%s', (_name, testcase) => {
      const { version, expectedValue } = testcase;
      // WHEN
      const result = Utils.validateVersionFormat(version);

      expect(result).toEqual(expectedValue);
    });
  });
});
