/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

var DEADLINE_AMI_ID = process.env.DEADLINE_AMI_ID?.toString();

var runTests = process.env.EXECUTE_DEADLINE_WORKER_TEST_SUITE?.toString();

if( runTests === 'true' ){
  test('DEADLINE_AMI_ID is set', () => {
    expect(DEADLINE_AMI_ID).toBeTruthy();
  });
}
else {
  test('Skipping test suite; preflight not run', () =>{
    expect(1).toEqual(1);
  });
}
