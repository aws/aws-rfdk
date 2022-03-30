#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to remove all stacks deployed by the framework
# Searches for configured test components and runs cdk destroy on the app within
# User must set INTEG_STACK_TAG manually so that the program can find the randomized stack names

set -euo pipefail
shopt -s globstar

INTEG_ROOT="$(pwd)"
BASH_SCRIPTS="$INTEG_ROOT/scripts/bash"
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
source "$INTEG_ROOT/components/deadline/common/scripts/bash/deploy-utils.sh"

if [ -z ${INTEG_STACK_TAG+x} ]; then
    echo "INTEG_STACK_TAG must be set, exiting..."
    exit 1
fi

# Load environment variables from config file
if [ ! "${SKIP_TEST_CONFIG-}" = true ]; then
  # Load variables from config file
  echo "Loading config..."
  source "$INTEG_ROOT/test-config.sh"
fi

# Set variables from script
source $BASH_SCRIPTS/set-test-variables.sh

# This is a best-effort. If any component fails to destroy, we proceed and try
# the others. Disable the exit on error option
set +e

for COMPONENT in **/cdk.json; do
    # In case the yarn install was done inside this integ package, there are some example cdk.json files in the aws-cdk
    # package we want to avoid.
    if [[ $COMPONENT == *"node_modules"* ]]; then
        continue
    fi
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$COMPONENT_ROOT")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && ../common/scripts/bash/component_e2e.sh "$COMPONENT_NAME" --destroy-only
    fi
done

cd "$INFRASTRUCTURE_APP" && npx cdk destroy "*" -f

cd "$INTEG_ROOT" && yarn run clean

exit 0
