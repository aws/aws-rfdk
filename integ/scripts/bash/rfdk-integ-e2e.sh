#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown

set -euo pipefail
shopt -s globstar

SCRIPT_EXIT_CODE=0

echo "RFDK end-to-end integration tests started $(date)"

# Mark test start time
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
if [ ! -d "${DEADLINE_STAGING_PATH}" ]
then
  $BASH_SCRIPTS/stage-deadline.sh
fi

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

# Define cleanup function for deployment failure
cleanup_on_failure () {
    echo "Testing failed. Performing failure cleanup..."
    yarn run tear-down
    exit 1
}

get_component_dirs () {
  # Find all "cdk.json" files (indicates parent dir is a CDK app)
  find . -name "cdk.json"           | \
  # Filter out node_modules
  grep -v node_modules              | \
  # Extract the directory name
  xargs -n1 dirname                 | \
  # Filter out apps whose driectories begin with an underscore (_) as this
  # convention indicates the app is not a test
  egrep -v "^_"                     | \
  # Sort
  sort
}

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
$BASH_SCRIPTS/deploy-infrastructure.sh || cleanup_on_failure

# Mark infrastructure deploy finish time
export INFRASTRUCTURE_DEPLOY_FINISH_TIME=$SECONDS

XARGS_ARGS="-n 1"
if [[ "${RUN_TESTS_IN_PARALLEL-}" = true ]]
then
  # Instruct xargs to run all the commands in parallel and block until they complete execution
  XARGS_ARGS="${XARGS_ARGS} -P 0"
fi

# Run the component tests (potentially in parallel)
get_component_dirs | xargs ${XARGS_ARGS} components/deadline/common/scripts/bash/component_e2e_driver.sh || cleanup_on_failure

# Destroy the infrastructure stack on completion
cd $INTEG_ROOT
export INFRASTRUCTURE_DESTROY_START_TIME=$SECONDS     # Mark infrastructure destroy start time
$BASH_SCRIPTS/teardown-infrastructure.sh || cleanup_on_failure
export INFRASTRUCTURE_DESTROY_FINISH_TIME=$SECONDS    # Mark infrastructure destroy finish time

cd "$INTEG_ROOT"

echo "Complete!"

# Report results
$BASH_SCRIPTS/report-test-results.sh

echo "Cleaning up folders..."
yarn run clean

echo "Exiting..."

exit $SCRIPT_EXIT_CODE
