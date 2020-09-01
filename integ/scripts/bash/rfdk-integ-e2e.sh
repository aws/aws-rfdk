#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown

set -euo pipefail
shopt -s globstar

#Mark test start time
export TEST_START_TIME="$(date +%s)"
SECONDS=$TEST_START_TIME

export INTEG_ROOT="$(pwd)"

# RFDK version is passed in as first argument (taken from package.json)
export RFDK_VERSION=$1

# Can supply parameter "--cleanup-on-failure" to tear down stacks if deployment errors
OPTION=$2

# Set variables from script
source $INTEG_ROOT/scripts/bash/set-test-variables.sh

# Make sure SSPL license has been accepted if running repository test
if [ ! "${SKIP_DEADLINE_REPOSITORY_TEST-}" == true ]; then
    if [ $USER_ACCEPTS_SSPL_FOR_RFDK_TESTS != true ]; then
        echo "Error: SSPL license has not been accepted for repository test; test will not run. See README.md for details"
        exit 1
    fi
fi

# Create temp directory
export INTEG_TEMP_DIR="$INTEG_ROOT/.e2etemp"
mkdir -p $INTEG_TEMP_DIR

# Stage deadline from script
$INTEG_ROOT/scripts/bash/stage-deadline.sh

# If executing worker fleet tests, find Deadline AMIs based on supplied version
if [ ! "${SKIP_DEADLINE_WORKER_TEST-}" == true ]; then
    $INTEG_ROOT/scripts/bash/fetch-worker-amis.sh
fi

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Mark pretest finish time
export PRETEST_FINISH_TIME=$SECONDS

echo "Starting RFDK-integ end-to-end tests"

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
# $INTEG_ROOT/scripts/bash/deploy-infrastructure.sh || yarn run tear-down

# Mark infrastructure deploy finish time
export INFRASTRUCTURE_DEPLOY_FINISH_TIME=$SECONDS

# Pull the top level directory for each cdk app in the components directory
for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")
    # Use a pattern match to exclude the infrastructure app from the results
    export ${COMPONENT_NAME}_START_TIME=$SECONDS
    if [[ "$COMPONENT_NAME" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && ./scripts/bash/e2e.sh --destroy-only || yarn run tear-down
    fi
    export ${COMPONENT_NAME}_FINISH_TIME=$SECONDS
done

# Mark infrastructure destroy start time
export INFRASTRUCTURE_DESTROY_START_TIME=$SECONDS

# Destroy the infrastructure stack on completion
cd $INTEG_ROOT
$INTEG_ROOT/scripts/bash/teardown-infrastructure.sh || yarn run tear-down

# Mark infrastructure destroy finish time
export INFRASTRUCTURE_DESTROY_FINISH_TIME=$SECONDS

cd "$INTEG_ROOT"

echo "Complete!"

# Report results
$INTEG_ROOT/scripts/bash/report-test-results.sh

echo "Cleaning up folders..."
yarn run clean

echo "Exiting..."

exit 0
