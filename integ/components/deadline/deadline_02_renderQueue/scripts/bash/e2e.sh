#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

OPTION=${1:-undefined}
COMPONENT_NAME="deadline_02_renderQueue"

if [[ $(basename $(pwd)) != $COMPONENT_NAME ]]; then
  echo "ERROR: Script must be run from top directory of test component"
  exit 1
fi

# Load utility functions
source "../common/functions/deploy-utils.sh"

if [ ! "${SKIP_DEADLINE_RENDERQ_TEST-}" == true ]; then

  if [[ $OPTION != "--destroy-only" ]]; then
    deploy_component_stacks $COMPONENT_NAME
    execute_component_test $COMPONENT_NAME
  fi
  if [[ $OPTION != "--deploy-only" ]]; then
    destroy_component_stacks $COMPONENT_NAME
  fi

fi

exit 0
