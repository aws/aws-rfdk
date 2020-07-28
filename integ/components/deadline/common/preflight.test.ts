/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const DEADLINE_REPOSITORY_INSTALLER_PATH = process.env.DEADLINE_REPOSITORY_INSTALLER_PATH?.toString();
const DEADLINE_INSTALLER_BUCKET = process.env.DEADLINE_INSTALLER_BUCKET?.toString();
const DEADLINE_INSTALLER_BUCKET_PROFILE = process.env.DEADLINE_INSTALLER_BUCKET_PROFILE?.toString();
const DEADLINE_VERSION = process.env.DEADLINE_VERSION?.toString();

const runRepositoryTests = process.env.EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE?.toString();

if (runRepositoryTests === 'true') {

  test('DEADLINE_REPOSITORY_INSTALLER_PATH is set if DEADLINE_INSTALLER_BUCKET is not set', () => {
    if(!DEADLINE_INSTALLER_BUCKET){
      expect(DEADLINE_REPOSITORY_INSTALLER_PATH).toBeTruthy();
    }
    else {
      expect(DEADLINE_INSTALLER_BUCKET).toBeTruthy();
    }
  });

  test('DEADLINE_REPOSITORY_INSTALLER_PATH is set if DEADLINE_INSTALLER_BUCKET_PROFILE is not set', () => {
    if(!DEADLINE_INSTALLER_BUCKET_PROFILE){
      expect(DEADLINE_REPOSITORY_INSTALLER_PATH).toBeTruthy();
    }
    else {
      expect(DEADLINE_INSTALLER_BUCKET_PROFILE).toBeTruthy();
    }
  });

  test('DEADLINE_VERSION is set', () => {
    expect(DEADLINE_VERSION).toBeTruthy();
  });
}
else {
  test('Skipping test suite; preflight not run', () =>{
    expect(1).toEqual(1);
  });
}