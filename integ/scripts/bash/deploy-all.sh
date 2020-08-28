#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to deploy stacks in default configuration for inspection by user

set -euo pipefail
shopt -s globstar

INTEG_ROOT="$(pwd)"
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
source "$INTEG_ROOT/test-config.sh"

if [ -z ${INTEG_STACK_TAG+x} ]; then
    # Create a unique tag to add to stack names and some resources
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
cd "$INFRASTRUCTURE_APP"
npx cdk deploy "*" --require-approval=never

cd "$INTEG_ROOT"

for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$COMPONENT_ROOT")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_STACK_TAG/$COMPONENT_ROOT" && ./scripts/bash/e2e.sh --deploy-only
    fi
done

exit 0
