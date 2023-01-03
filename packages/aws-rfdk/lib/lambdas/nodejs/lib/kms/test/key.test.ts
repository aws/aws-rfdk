/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Key } from '../key';

test('success', () => {
  const arn = 'arn:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab';
  const key = Key.fromArn(arn);
  expect(key.arn).toEqual(arn);
});

test('bad arn', () => {
  const arn = 'badArn';
  expect(() => Key.fromArn(arn)).toThrow(`Not a KMS ARN: ${arn}`);
});
