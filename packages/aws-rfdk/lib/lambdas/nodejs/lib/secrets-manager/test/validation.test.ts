/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isArn } from '../validation';

// ARN format:
//  arn:aws:secretsmanager:<Region>:<AccountId>:secret:OptionalPath/SecretName-6RandomCharacters
test.each([
  // Start with a full valid arn, and then remove/change each part from left to right
  ['arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', true],
  ['arn:aws-cn:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', true],
  ['arn:aws-us-gov:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', true],
  [':aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['a:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['arn::secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['arn:a:secretsmanager:us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['arn:aws::us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['arn:aws:aa:us-west-1:1234567890:secret:SecretPath/SecretName', false],
  ['arn:aws:secretsmanager::1234567890:secret:SecretPath/SecretName', true],
  ['arn:aws:secretsmanager:us-west-1::secret:SecretPath/SecretName', true],
  ['arn:aws:secretsmanager:us-west-1:1234567890::SecretPath/SecretName', false],
  ['arn:aws:secretsmanager:us-west-1:1234567890:sec:SecretPath/SecretName', false],
  ['arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretName', true],
  ['arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/', true],
])('isArn(%s) -> %p', (value: string, expected: boolean) => {
  expect(isArn(value)).toBe(expected);
});
