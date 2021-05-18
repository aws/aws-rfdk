#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

COMPONENT_NAME=${1:-undefined}
OPTION=${2:-undefined}

if [[ $(basename $(pwd)) != $COMPONENT_NAME ]]; then
  echo "ERROR: Script must be run from top directory of test component"
  exit 1
fi

function log_error () {
  exit_code=$?
  action=$1
  echo "[${COMPONENT_NAME}] ${action} failed"
  return $exit_code
}

SKIP_TEST_CHECK=\$SKIP_${COMPONENT_NAME}_TEST
SKIP_TEST_CHECK=$(eval "echo $SKIP_TEST_CHECK" 2> /dev/null) || SKIP_TEST_CHECK=false
if [[ ! "${SKIP_TEST_CHECK}" = "true" ]]; then
  # Load utility functions
  source "../common/scripts/bash/deploy-utils.sh"

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  if [[ $OPTION != '--destroy-only' ]]; then
    deploy_component_stacks $COMPONENT_NAME || log_error "app deployment"
    execute_component_test $COMPONENT_NAME || log_error "running test suite"
  fi
  if [[ $OPTION != '--deploy-and-test-only' ]]; then
    destroy_component_stacks $COMPONENT_NAME
  fi
fi

exit 0
