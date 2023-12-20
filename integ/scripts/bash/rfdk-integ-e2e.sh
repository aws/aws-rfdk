#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown

set -euo pipefail
shopt -s globstar

USAGE="Usage: ./$0 [-d]

Runs the RFDK integration tests.

Options:
  -d Runs in development mode. CloudFormation stacks will not be torn down and temporary script output will not be deleted.
  -h Displays this help text.
"

export DEV_MODE=${DEV_MODE:-false}

while getopts "hd" opt; do
  case $opt in
    h)
        echo "${USAGE}"
        exit 1
    ;;
    d)
      export DEV_MODE=true
      echo "Running in development mode..."
    ;;
    \?)
        echo -e "\n${USAGE}" >&2
        exit 1
    ;;
  esac
done

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

# Find Deadline AMIs based on supplied version
source $BASH_SCRIPTS/fetch-worker-amis.sh

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Mark pretest finish time
export PRETEST_FINISH_TIME=$SECONDS

# Define cleanup function for deployment failure
cleanup_on_failure () {
  if [[ "$DEV_MODE" == "true" ]]; then
    echo "Running in development mode, skipping cleanup..."
  else
    echo "Performing best-effort full cleanup..."
    yarn run tear-down
  fi
}

get_component_dirs () {
  # Find all "test_marker" files (indicates parent dir is a CDK test app)
  find . -name "test_marker"        | \
  # Filter out node_modules
  grep -v node_modules              | \
  # Extract the directory name
  xargs -n1 dirname                 | \
  # Filter out apps whose driectories begin with an underscore (_) as this
  # convention indicates the app is not a test
  grep -v "/_"                      | \
  # Sort
  sort
}

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
$BASH_SCRIPTS/deploy-infrastructure.sh || (
  echo "$(date "+%Y-%m-%dT%H:%M:%S") [infrastructure] Error deploying infrastructure"
  cleanup_on_failure
  false
)

# Mark infrastructure deploy finish time
export INFRASTRUCTURE_DEPLOY_FINISH_TIME=$SECONDS

XARGS_ARGS="-n 1"
if [[ "${RUN_TESTS_IN_PARALLEL-}" = true ]]
then
  # Instruct xargs to run all the commands in parallel and block until they complete execution
  XARGS_ARGS="${XARGS_ARGS} -P 0"
fi

# At this point in processing, we don't want failures to abort the script
# All statements below this must execute
set +e

# Run the component tests (potentially in parallel).
get_component_dirs | xargs ${XARGS_ARGS} components/deadline/common/scripts/bash/component_e2e_driver.sh
# Capture the exit code for returning later from this process
SCRIPT_EXIT_CODE=$?

# Destroy the infrastructure stack on completion. 
export INFRASTRUCTURE_DESTROY_START_TIME=$SECONDS     # Mark infrastructure destroy start time
if [[ "$DEV_MODE" == "true" ]]; then
  echo "Running in development mode, keeping infrastructure up..."
else
  $BASH_SCRIPTS/teardown-infrastructure.sh || (
    echo '$(date "+%Y-%m-%dT%H:%M:%S") [infrastructure] Error destroying infrastructure'
    # This is a best-effort since we always want to report the test results if possible.
    cleanup_on_failure || true
  )
fi
export INFRASTRUCTURE_DESTROY_FINISH_TIME=$SECONDS    # Mark infrastructure destroy finish time

echo "Complete!"

# Report results
$BASH_SCRIPTS/report-test-results.sh

if [[ "$DEV_MODE" == "true" ]]; then
  echo "Running in development mode, skipping folder cleanup..."
else
  echo "Cleaning up folders..."
  yarn run clean
fi

echo "Exiting..."

exit $SCRIPT_EXIT_CODE
