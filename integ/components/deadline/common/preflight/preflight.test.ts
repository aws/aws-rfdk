/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const AWS_REGION = process.env.AWS_REGION?.toString();
const DEADLINE_VERSION = process.env.DEADLINE_VERSION?.toString();
const DEADLINE_STAGING_PATH = process.env.DEADLINE_STAGING_PATH?.toString();

test('AWS_REGION is set', () => {
  expect(AWS_REGION).toBeTruthy();
});

test('DEADLINE_VERSION is set', () => {
  expect(DEADLINE_VERSION).toBeTruthy();
});

test('DEADLINE_STAGING_PATH is set', () => {
  expect(DEADLINE_STAGING_PATH).toBeTruthy();
});
