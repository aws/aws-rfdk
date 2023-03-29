/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Version } from '../../lib/version-provider/version';

describe('validateVersionString', () => {
  test('correct input', () => {
    expect(Version.validateVersionString('10.1.9.2')).toBeTruthy();
  });
  test('malformed input', () => {
    expect(Version.validateVersionString('10.1.9.2.1')).toBeFalsy();
  });
});

describe('parseVersionString', () => {
  test.each([
    [
      '10.1.10.6',
      [ '10', '1', '10', '6' ],
    ],
    [
      '10.1.9.2',
      [ '10', '1', '9', '2' ],
    ],
    [
      '10.1.9',
      [ '10', '1', '9' ],
    ],
    [
      '10.1',
      [ '10', '1' ],
    ],
    [
      '10',
      [ '10' ],
    ],
  ])('correct input: %p', (value: string, resultArray: string[]) => {
    const regexResult = Version.parseFromVersionString(value);

    expect(regexResult).not.toBeNull();
    if (regexResult === null) { return; }

    expect(regexResult[0]).toEqual(value);

    for (let x = 0; x < resultArray.length; x++) {
      expect(regexResult[x+1]).toEqual(resultArray[x]);
    }
  });

  test.each([
    '10.1.9.2.1',
    '10.',
    '10.1.',
    '10.-1',
    'a.b.c',
  ])('incorrect version %s parsing', (versionString: string) => {
    const result = Version.parseFromVersionString(versionString);
    expect(result).toBeNull();
  });
});

describe('convertToFullVersionString', () => {
  test('correct input', () => {
    expect(Version.convertToFullVersionString(
      '10',
      '1',
      '9',
      '2',
    )).toEqual('10.1.9.2');
  });

  test('negative value', () => {
    expect(() => Version.convertToFullVersionString(
      '10',
      '-1',
      '9',
      '2',
    )).toThrow(/A component of the version was not in the correct format/);
  });

  test('non-numeric value', () => {
    expect(() => Version.convertToFullVersionString(
      '10',
      'test',
      '9',
      '2',
    )).toThrow(/A component of the version was not in the correct format/);
  });
});
