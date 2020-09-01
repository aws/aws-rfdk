#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

OPTION=${1:-undefined}

if [[ $(basename $(pwd)) != *repository ]]; then
  echo "ERROR: Script must be run from top directory of test component"
  exit 1
fi

# Load utility functions
source "../common/functions/deploy-utils.sh"

if [ $EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE = true ]; then
  
  if [[ $OPTION != '--destroy-only' ]]; then
    deploy_component_stacks "Deadline Repository"
    execute_component_test "deadline_01_repository"
  fi
  if [[ $OPTION != '--deploy-only' ]]; then
    destroy_component_stacks "Deadline Repository"
  fi

fi

exit 0
