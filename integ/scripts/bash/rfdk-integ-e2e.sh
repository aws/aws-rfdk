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
BASH_SCRIPTS="$INTEG_ROOT/scripts/bash"

# Load environment variables from config file
if [ ! "${SKIP_TEST_CONFIG-}" = true ]; then
  # Load variables from config file
  echo "Loading config..."
  source "$INTEG_ROOT/test-config.sh"
fi

# Set variables from script
source $BASH_SCRIPTS/set-test-variables.sh

# Make sure SSPL license has been accepted if running repository test
if [ ! "${SKIP_deadline_01_repository_TEST-}" = true ]; then
    if [ $USER_ACCEPTS_SSPL_FOR_RFDK_TESTS != true ]; then
        echo "Error: SSPL license has not been accepted for repository test; test will not run. See README.md for details"
        exit 1
    fi
fi

# Create temp directory
export INTEG_TEMP_DIR="$INTEG_ROOT/.e2etemp"
rm -rf $INTEG_TEMP_DIR
mkdir -p $INTEG_TEMP_DIR

# Stage deadline from script
$BASH_SCRIPTS/stage-deadline.sh

# Extract the Deadline version to use for Deadline installations on the farm.
# Tests allow not specifying or specifying a partial version string such as "10.1.12". After staging, we
# obtain the fully resolved version (e.g. "10.1.12.1") which is required to determine
# the matching AWS Portal AMI IDs
export DEADLINE_VERSION=$(node -e $'const json = require(process.argv[1] + \'/manifest.json\'); console.log(json.version)' "$DEADLINE_STAGING_PATH")

# If executing worker fleet tests, find Deadline AMIs based on supplied version
if [ ! "${SKIP_deadline_03_repository_TEST-}" = true ]; then
    source $BASH_SCRIPTS/fetch-worker-amis.sh
fi

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Mark pretest finish time
export PRETEST_FINISH_TIME=$SECONDS

echo "Starting RFDK-integ end-to-end tests"

# Define cleanup function for deployment failure
cleanup_on_failure () {
    yarn run tear-down
    exit 1
}

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
$BASH_SCRIPTS/deploy-infrastructure.sh || cleanup_on_failure

# Mark infrastructure deploy finish time
export INFRASTRUCTURE_DEPLOY_FINISH_TIME=$SECONDS

# Pull the top level directory for each cdk app in the components directory
COMPONENTS=()
for COMPONENT in **/cdk.json; do
    # In case the yarn install was done inside this integ package, there are some example cdk.json files in the aws-cdk
    # package we want to avoid.
    if [[ $COMPONENT == *"node_modules"* ]]; then
        continue
    fi

    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")

    # Use a pattern match to exclude the infrastructure app from the results
    export ${COMPONENT_NAME}_START_TIME=$SECONDS
    if [[ "$COMPONENT_NAME" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT"
        if [ "${RUN_TESTS_IN_PARALLEL-}" = true ]; then
            (../common/scripts/bash/component_e2e.sh "$COMPONENT_NAME" || ../common/scripts/bash/component_e2e.sh "$COMPONENT_NAME" --destroy-only) &
            export ${COMPONENT_NAME}_PID=$!
            COMPONENTS+=(${COMPONENT_NAME})
        else
            ../common/scripts/bash/component_e2e.sh "$COMPONENT_NAME" || cleanup_on_failure
        fi
    fi
    export ${COMPONENT_NAME}_FINISH_TIME=$SECONDS
done

if [ "${RUN_TESTS_IN_PARALLEL-}" = true ]; then
    while [ "${#COMPONENTS[@]}" -ne 0 ]; do
        ACTIVE_COMPONENTS=()
        for COMPONENT_NAME in ${COMPONENTS[@]}; do
            PID=$(eval echo \"\$${COMPONENT_NAME}_PID\")
            if ps -p "$PID" > /dev/null; then
              ACTIVE_COMPONENTS+=(${COMPONENT_NAME})
            else
              echo "Test app $COMPONENT_NAME finished."
              if [ -f "$INTEG_TEMP_DIR/${COMPONENT_NAME}_deploy.txt" ]; then
                cat "$INTEG_TEMP_DIR/${COMPONENT_NAME}_deploy.txt"
              fi
              if [ -f "$INTEG_TEMP_DIR/${COMPONENT_NAME}.txt" ]; then
                cat "$INTEG_TEMP_DIR/${COMPONENT_NAME}.txt"
              fi
              if [ -f "$INTEG_TEMP_DIR/${COMPONENT_NAME}_destroy.txt" ]; then
                cat "$INTEG_TEMP_DIR/${COMPONENT_NAME}_destroy.txt"
              fi
            fi
            export ${COMPONENT_NAME}_FINISH_TIME=$SECONDS
        done
        if [ "${#ACTIVE_COMPONENTS[@]}" -ne 0 ]; then
          COMPONENTS=(${ACTIVE_COMPONENTS[@]})
        else
          COMPONENTS=()
        fi
        sleep 1
    done

    wait
fi

# Mark infrastructure destroy start time
export INFRASTRUCTURE_DESTROY_START_TIME=$SECONDS

# Destroy the infrastructure stack on completion
cd $INTEG_ROOT
$BASH_SCRIPTS/teardown-infrastructure.sh || cleanup_on_failure

# Mark infrastructure destroy finish time
export INFRASTRUCTURE_DESTROY_FINISH_TIME=$SECONDS

cd "$INTEG_ROOT"

echo "Complete!"

# Report results
$BASH_SCRIPTS/report-test-results.sh

echo "Cleaning up folders..."
yarn run clean

echo "Exiting..."

exit 0
