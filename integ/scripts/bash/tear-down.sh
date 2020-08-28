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
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"

if [ -z ${INTEG_STACK_TAG+x} ]; then
    echo "INTEG_STACK_TAG must be set, exiting..."
    exit 1
fi

for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$COMPONENT_ROOT")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && ./scripts/bash/e2e.sh --destroy-only
    fi
done

cd "$INFRASTRUCTURE_APP" && npx cdk destroy "*" -f

cd "$INTEG_ROOT" && yarn run clean

exit 0
