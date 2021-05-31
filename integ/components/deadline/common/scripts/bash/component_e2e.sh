#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -uo pipefail

# Disable exit on error. Errors are manually handled by the script
set +e

COMPONENT_NAME=${1:-undefined}
OPTION=${2:-undefined}

SCRIPT_EXIT_CODE=0

if [[ $(basename $(pwd)) != $COMPONENT_NAME ]]; then
  echo "ERROR: Script must be run from top directory of test component"
  exit 1
fi

SKIP_TEST_CHECK=\$SKIP_${COMPONENT_NAME}_TEST
SKIP_TEST_CHECK=$(eval "echo $SKIP_TEST_CHECK" 2> /dev/null) || SKIP_TEST_CHECK=false
if [[ ! "${SKIP_TEST_CHECK}" = "true" ]]; then
  # Load utility functions
  source "../common/scripts/bash/deploy-utils.sh"

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  if [[ $OPTION != '--destroy-only' ]]; then

    deploy_component_stacks $COMPONENT_NAME
    DEPLOY_EXIT_CODE=$?

    if [[ $DEPLOY_EXIT_CODE -eq 0 ]]
    then
      echo "$(timestamp) [${COMPONENT_NAME}] running test suite started"

      execute_component_test $COMPONENT_NAME
      SCRIPT_EXIT_CODE=$?

      echo "$(timestamp) [${COMPONENT_NAME}] running test suite complete"

      test_report_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/test-report.json"
      if [[ -f "${test_report_path}" ]]
      then
        if [[ $(node -pe "require('${test_report_path}').numFailedTests") -eq 0 ]]
        then
          echo "$(timestamp) [${COMPONENT_NAME}] test suite passed"
        else
          echo "$(timestamp) [${COMPONENT_NAME}] test suite failed"
        fi
      fi
    else
      SCRIPT_EXIT_CODE=$DEPLOY_EXIT_CODE
    fi

  fi
  if [[ $OPTION != '--deploy-and-test-only' ]]; then
    destroy_component_stacks $COMPONENT_NAME
    DESTROY_EXIT_CODE=$?

    # We want the exit-code to reflect the deploy and test portion if
    # non-zero. Otherwise, destroy exit code should be used
    if [[ $SCRIPT_EXIT_CODE -eq 0 ]]
    then
      SCRIPT_EXIT_CODE=$DESTROY_EXIT_CODE
    fi
  fi
fi

exit $SCRIPT_EXIT_CODE
