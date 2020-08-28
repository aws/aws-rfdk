#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

OPTION=${1:-undefined}

if [ $(basename $(pwd)) != "workerFleet" ]; then
  echo "ERROR: Script must be run from top directory of test component"
  exit 1
fi

# Load utility functions
source "../common/functions/deploy-utils.sh"

if [ $EXECUTE_DEADLINE_WORKER_TEST_SUITE == true ]; then

  if [[ $OPTION != '--destroy-only' ]]; then
    deploy_component_stacks "Deadline WorkerInstanceFleet"
    execute_component_test "deadline-workerFleet"
  fi
  if [[ $OPTION != '--deploy-only' ]]; then
    destroy_component_stacks "Deadline WorkerInstanceFleet"
  fi

fi

exit 0
