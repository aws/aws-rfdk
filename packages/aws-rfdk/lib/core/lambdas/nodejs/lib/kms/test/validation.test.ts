/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isArn } from '../validation';

// ARN format:
//  arn:aws:kms:<Region>?:<AccountId>?:key/<UUID>
test.each([
  // Start with a full valid arn, and then remove/change each part from left to right
  ['arn:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', true],
  [':aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['a:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn::kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws-cn:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', true],
  ['arn:aws-us-gov:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', true],
  ['arn:a:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws::us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws:k:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws:kms::111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab', true],
  ['arn:aws:kms:us-west-2::key/1234abcd-12ab-34cd-56ef-1234567890ab', true],
  ['arn:aws:kms:us-west-2:111122223333:/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws:kms:us-west-2:111122223333:k/1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws:kms:us-west-2:111122223333:key1234abcd-12ab-34cd-56ef-1234567890ab', false],
  ['arn:aws:kms:us-west-2:111122223333:key/', false],
  ['arn:aws:kms:us-west-2:111122223333:key/invalid-characters-ghijklmnopqr', false],
])('test isArn(%s) -> %p', (value: string, expected: boolean) => {
  expect(isArn(value)).toBe(expected);
});