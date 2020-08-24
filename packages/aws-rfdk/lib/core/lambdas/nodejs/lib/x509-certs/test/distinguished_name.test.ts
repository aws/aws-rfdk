/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DistinguishedName,
  DistinguishedNameProps,
  implementsDistinguishedNameProps,
} from '../distinguished-name';

test('toString only CN', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.toString()).toBe('/CN=Test CN');
});
test('toString only CN+OU', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    OU: 'Test OU',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.toString()).toBe('/CN=Test CN/OU=Test OU');
});
test('toString only CN+O', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    O: 'Test O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.toString()).toBe('/CN=Test CN/O=Test O');
});
test('toString CN+OU+O', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    OU: 'Test OU',
    O: 'Test O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.toString()).toBe('/CN=Test CN/O=Test O/OU=Test OU');
});

test('validation pass', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    OU: 'Test OU',
    O: 'Test O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.isValid()).toBe(true);
});

test('validation fail CN', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test/CN',
    OU: 'Test OU',
    O: 'Test O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.isValid()).toBe(false);
});

test('validation fail OU', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    OU: 'Test/OU',
    O: 'Test O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.isValid()).toBe(false);
});

test('validation fail O', () => {
  // GIVEN
  const name: DistinguishedNameProps = {
    CN: 'Test CN',
    OU: 'Test OU',
    O: 'Test/O',
  };

  // WHEN
  const dname = new DistinguishedName(name);

  // THEN
  expect(dname.isValid()).toBe(false);
});

test.each([
  [undefined, false],
  ['string', false],
  [{}, false],
  [{ CN: {} }, false],
  [{ CN: 'string' }, true],
  [{ CN: 'string',  O: {} }, false],
  [{ CN: 'string',  O: 'string' }, true],
  [{ CN: 'string',  OU: {} }, false],
  [{ CN: 'string',  OU: 'string' }, true],
  [{ CN: 'string',  O: {}, OU: 'string' }, false],
  [{ CN: 'string',  O: 'string', OU: {} }, false],
  [{ CN: 'string',  O: 'string', OU: 'string' }, true],
  [{ CN: 'string',  O: 'string', OU: 'string', RANDOM: {} }, true],
  [{ CN: 'string',  O: 'string', OU: 'string', RANDOM: 'string' }, true],
])('implementsDistinguishedNameProps: %p is %p', (value: any, expected: boolean) => {
  expect(implementsDistinguishedNameProps(value)).toBe(expected);
});
