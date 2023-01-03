/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateSha256Hash } from '../hash';

test('invariant', () => {
  // GIVEN
  const value1 = 'foo';
  const value2 = 'foo';

  // WHEN
  const hash1 = calculateSha256Hash(value1);
  const hash2 = calculateSha256Hash(value2);

  // THEN
  expect(hash1).toStrictEqual(hash2);
});

test('recurses object', () => {
  // GIVEN
  const value1: object = {
    key1: 'value',
    nestedObj: {
      key1: 12,
      key2: 'some value',
    },
  };
  const value2: object = {
    key1: 'value',
    nestedObj: {},
  };

  // WHEN
  const hash1 = calculateSha256Hash(value1);
  const hash2 = calculateSha256Hash(value2);

  // THEN
  expect(hash1).not.toStrictEqual(hash2);
});

test('iterates array', () => {
  // GIVEN
  const value1: string[] = [];
  const value2 = ['foo'];

  // WHEN
  const hash1 = calculateSha256Hash(value1);
  const hash2 = calculateSha256Hash(value2);

  // THEN
  expect(hash1).not.toStrictEqual(hash2);
});

test('key order invariant', () => {
  // GIVEN
  const value1: object = {
    key1: 'foo',
    key2: 'bar',
  };
  const value2: object = {
    key2: 'bar',
    key1: 'foo',
  };

  // WHEN
  const hash1 = calculateSha256Hash(value1);
  const hash2 = calculateSha256Hash(value2);

  // THEN
  expect(hash1).toStrictEqual(hash2);
});

test('bad type', () => {
  // GIVEN
  const value = true;

  // THEN
  expect(() => calculateSha256Hash(value)).toThrow(`Unexpected value type: ${typeof(value)}`);
});
