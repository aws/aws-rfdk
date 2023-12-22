#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to deploy stacks in default configuration for inspection by user

set -euo pipefail
shopt -s globstar

export INTEG_ROOT="$(pwd)"

# Create temp directory
export INTEG_TEMP_DIR="$INTEG_ROOT/.e2etemp"
rm -rf $INTEG_TEMP_DIR
mkdir -p $INTEG_TEMP_DIR

BASH_SCRIPTS="$INTEG_ROOT/scripts/bash"
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"

# Load environment variables from config file
if [ ! "${SKIP_TEST_CONFIG-}" = true ]; then
  # Load variables from config file
  echo "Loading config..."
  source "$INTEG_ROOT/test-config.sh"
fi

# Set variables from script
source $BASH_SCRIPTS/set-test-variables.sh

if [ -z ${INTEG_STACK_TAG+x} ]; then
    # Create a unique tag to add to stack names and some resources
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
cd "$INFRASTRUCTURE_APP"
npx cdk deploy "*" --require-approval=never

cd "$INTEG_ROOT"

for COMPONENT in **/test_marker; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    COMPONENT_NAME=$(basename "$COMPONENT_ROOT")
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$COMPONENT_ROOT")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && ../common/scripts/bash/component_e2e.sh "$COMPONENT_NAME" --deploy-and-test-only || true
    fi
done

exit 0
