/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const DEADLINE_VERSION = process.env.DEADLINE_VERSION?.toString();
const DEADLINE_STAGING_PATH = process.env.DEADLINE_STAGING_PATH?.toString();

const runRepositoryTests = process.env.EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE?.toString();

if (runRepositoryTests === 'true') {

  test('DEADLINE_VERSION is set', () => {
    expect(DEADLINE_VERSION).toBeTruthy();
  });

  test('DEADLINE_STAGING_PATH is set', () => {
    expect(DEADLINE_STAGING_PATH).toBeTruthy();
  });
}
else {
  test('Skipping test suite; preflight not run', () =>{
    expect(1).toEqual(1);
  });
}
