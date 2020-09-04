#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
shopt -s globstar

PRETEST_TIME=$(( $PRETEST_FINISH_TIME - $TEST_START_TIME ))
echo "Pretest setup runtime: $((($PRETEST_TIME / 60) % 60))m $(($PRETEST_TIME % 60))s"

INFRASTRUCTURE_DEPLOY_TIME=$(( $INFRASTRUCTURE_DEPLOY_FINISH_TIME - $PRETEST_FINISH_TIME ))
echo "Infrastructure stack deploy runtime: $((($INFRASTRUCTURE_DEPLOY_TIME / 60) % 60))m $(($INFRASTRUCTURE_DEPLOY_TIME % 60))s"

INFRASTRUCTURE_DESTROY_TIME=$(( $INFRASTRUCTURE_DESTROY_FINISH_TIME - $INFRASTRUCTURE_DESTROY_START_TIME ))
echo "Infrastructure stack cleanup runtime: $((($INFRASTRUCTURE_DESTROY_TIME / 60) % 60))m $(($INFRASTRUCTURE_DESTROY_TIME % 60))s"

# Function pulls test results from test output file and calculates time spent on each stage of the test
report_results () {
    COMPONENT_NAME=$1

    if [ $(ls "$INTEG_TEMP_DIR/$COMPONENT_NAME.json" 2> /dev/null) ]; then
        # Get test numbers from jest output
        TESTS_RAN=$(node -e $'const json = require(process.argv[1]); console.log(json.numTotalTests)' "$INTEG_TEMP_DIR/$COMPONENT_NAME.json")
        TESTS_PASSED=$(node -e $'const json = require(process.argv[1]); console.log(json.numPassedTests)' "$INTEG_TEMP_DIR/$COMPONENT_NAME.json")
        TESTS_FAILED=$(node -e $'const json = require(process.argv[1]); console.log(json.numFailedTests)' "$INTEG_TEMP_DIR/$COMPONENT_NAME.json")

        DEPLOY_START_TIME=${COMPONENT_NAME}_START_TIME
        DEPLOY_FINISH_TIME=$(node -e $'const json = require(process.argv[1]); console.log(json.startTime)' "$INTEG_TEMP_DIR/$COMPONENT_NAME.json")
        DEPLOY_FINISH_TIME="${DEPLOY_FINISH_TIME:0:10}"
        DESTROY_START_TIME=$(node -e $'const json = require(process.argv[1]); console.log(json.testResults[0].endTime)' "$INTEG_TEMP_DIR/$COMPONENT_NAME.json")
        DESTROY_START_TIME="${DESTROY_START_TIME:0:10}"
        DESTROY_FINISH_TIME=${COMPONENT_NAME}_FINISH_TIME

        # Calculate seconds from when deploy began to when test began
        DEPLOY_TIME=$(( $DEPLOY_FINISH_TIME - $DEPLOY_START_TIME ))
        # Calculate seconds from when deploy ended to when teardown began
        TEST_TIME=$(( $DESTROY_START_TIME - $DEPLOY_FINISH_TIME ))
        # Calculate seconds from when test ended to when teardown finished
        DESTROY_TIME=$(( $DESTROY_FINISH_TIME - $DESTROY_START_TIME ))

        echo "Results for test component $COMPONENT_NAME: "
        echo "  -Tests ran:"    $TESTS_RAN
        echo "  -Tests passed:" $TESTS_PASSED
        echo "  -Tests failed:" $TESTS_FAILED
        echo "  -Deploy runtime:     $((($DEPLOY_TIME / 60) % 60))m $(($DEPLOY_TIME % 60))s"
        echo "  -Test suite runtime: $((($TEST_TIME / 60) % 60))m $(($TEST_TIME % 60))s"
        echo "  -Cleanup runtime:    $((($DESTROY_TIME / 60) % 60))m $(($DESTROY_TIME % 60))s"

    fi
}

# Report test results for each test component
for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$COMPONENT_NAME" != _* ]]; then
        report_results $COMPONENT_NAME
        
    fi
    export ${COMPONENT_NAME}_FINISH_TIME=$SECONDS
done

exit 0
