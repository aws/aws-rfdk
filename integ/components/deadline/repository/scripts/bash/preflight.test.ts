/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

var USER_ACCEPTS_SSPL_FOR_RFDK_TESTS = process.env.USER_ACCEPTS_SSPL_FOR_RFDK_TESTS?.toString();

var runTests = process.env.EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE?.toString();

if( runTests === 'true' ){
  test('USER_ACCEPTS_SSPL_FOR_RFDK_TESTS is set to true', () => {
    expect(USER_ACCEPTS_SSPL_FOR_RFDK_TESTS).toBe('true');
  });
}
else {
  test('Skipping test suite; preflight not run', () =>{
    expect(1).toEqual(1);
  });
}