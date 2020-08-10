#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to deploy stacks in default configuration for inspection by user

set -euo pipefail
shopt -s globstar

root="$(pwd)"
infrastructure="${root}/components/_infrastructure"
source "${root}/test-config.sh"

if [ -z ${INTEG_STACK_TAG+x} ]; then
    # Create a unique tag to add to stack names and some resources
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Run preflight checks to make sure necessary variables, etc. are set
jest --passWithNoTests --silent "preflight"

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
cd "$infrastructure"
npx cdk deploy "*" --require-approval=never

cd "$root"

for component in **/cdk.json; do
    component_root="$(dirname "$component")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$component_root")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "${root}/${component_root}" && "./scripts/bash/deploy-stacks.sh"
    fi
done
