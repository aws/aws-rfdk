#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown
# 

set -euo pipefail
shopt -s globstar

#Mark test start time
TEST_START_TIME="$(date +%s)"
SECONDS=$TEST_START_TIME

INTEG_ROOT="$(pwd)"

# RFDK version is passed in as first argument (taken from package.json)
RFDK_VERSION=$1

# Can supply parameter "--cleanup-on-failure" to tear down stacks if deployment errors
OPTION=$2

# Load variables from config file
echo "Loading config..."
source "./test-config.sh"

# Define catch function on deployment failure
cleanup_on_failure () {
    if [ $OPTION == "--cleanup-on-failure" ]; then
        echo "Something went wrong. Aborting deployment and cleaning up stacks..."
        cd $INTEG_ROOT
        ./scripts/bash/tear-down.sh
        exit 1
    fi
}

# Make sure SSPL license has been accepted if running repository test
if [ ! "${SKIP_DEADLINE_REPOSITORY_TEST-}" == true ]; then
    if [ $USER_ACCEPTS_SSPL_FOR_RFDK_TESTS != true ]; then
        echo "Error: SSPL license has not been accepted for repository test; test will not run. See README.md for details"
        exit 1
    fi
fi

# Create temp directory
INTEG_TEMP_DIR="$INTEG_ROOT/.e2etemp"
mkdir -p $INTEG_TEMP_DIR

# Get region from CDK_DEFAULT_REGION; assume us-west-2 if it's not set
if [ -z ${CDK_DEFAULT_REGION+x} ]; then
    export AWS_REGION="us-west-2"
else
    export AWS_REGION=$CDK_DEFAULT_REGION
fi

# Set staging path to default if not overridden
if [ -z ${DEADLINE_STAGING_PATH+x} ]; then
    DEADLINE_STAGING_PATH="$INTEG_ROOT/stage"
else
    #If path is set, extract the Deadline version to use for Deadline installations on the farm. This will override any other Deadline version provided.
    export DEADLINE_VERSION=$(node -e $'const json = require(process.argv[1] + \'/manifest.json\'); console.log(json.version)' "$DEADLINE_STAGING_PATH")
fi

# Set Deadline version to default if not overridden
if [ -z ${DEADLINE_VERSION+x} ]; then
    DEADLINE_VERSION="10.1.9.2"
fi

# Check if Deadline assets are staged at configured path
if [ ! $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    # Stage Deadline assets
    npx --package=aws-rfdk@$RFDK_VERSION stage-deadline --deadlineInstallerURI "s3://thinkbox-installers/Deadline/$DEADLINE_VERSION/Linux/DeadlineClient-$DEADLINE_VERSION-linux-x64-installer.run" --dockerRecipesURI "s3://thinkbox-installers/DeadlineDocker/$DEADLINE_VERSION/DeadlineDocker-$DEADLINE_VERSION.tar.gz" --output "$DEADLINE_STAGING_PATH"
fi

# If executing worker fleet tests, find Deadline AMIs based on supplied version
if [ ! "${SKIP_DEADLINE_WORKER_TEST-}" == true ]; then
    # Only pull AMI ids if one of these variables is not already set
    if [ -z ${LINUX_DEADLINE_AMI_ID+x} ] || [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
        DEADLINE_RELEASE=$(sed 's/\(.*\..*\..*\)\..*/\1/' <<< $DEADLINE_VERSION)
        curl https://awsportal.s3.amazonaws.com/$DEADLINE_RELEASE/Release/amis.json --silent -o "$INTEG_TEMP_DIR/amis.json"
        if [ -z ${LINUX_DEADLINE_AMI_ID+x} ]; then
            export LINUX_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./.e2etemp/amis.json\'); console.log(json[process.argv[1]].worker["ami-id"])' "$AWS_REGION")
        fi
        if [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
            export WINDOWS_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./.e2etemp/amis.json\'); console.log(json[process.argv[1]].windowsWorker["ami-id"])' "$AWS_REGION")
        fi
    fi
fi

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Mark pretest finish time
PRETEST_FINISH_TIME=$SECONDS

echo "Starting RFDK-integ end-to-end tests"

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"
echo "Deploying RFDK-integ infrastructure..."
npx cdk deploy "*" --require-approval=never || cleanup_on_failure
echo "RFDK-integ infrastructure deployed."
cd "$INTEG_ROOT"

# Mark infrastructure deploy finish time
INFRASTRUCTURE_DEPLOY_FINISH_TIME=$SECONDS

# Pull the top level directory for each cdk app in the components directory
for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")
    # Use a pattern match to exclude the infrastructure app from the results
    export ${COMPONENT_NAME}_START_TIME=$SECONDS
    if [[ "$COMPONENT_NAME" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && ./scripts/bash/e2e.sh || cleanup_on_failure
    fi
    export ${COMPONENT_NAME}_FINISH_TIME=$SECONDS
done

# Mark infrastructure destroy start time
INFRASTRUCTURE_DESTROY_START_TIME=$SECONDS

# Destroy the infrastructure stack on completion
echo "Test suites completed. Destroying infrastructure stack..."
cd "$INFRASTRUCTURE_APP"
npx cdk destroy "*" -f
echo "Infrastructure stack destroyed."

# Mark infrastructure destroy finish time
INFRASTRUCTURE_DESTROY_FINISH_TIME=$SECONDS

cd "$INTEG_ROOT"

echo "Complete!"

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

echo "Cleaning up folders..."
yarn run clean

echo "Exiting..."

exit 0
