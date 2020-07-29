#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to remove all stacks deployed by the framework
# Searches for configured test components and runs cdk destroy on the app within
# User must set INTEG_STACK_TAG manually so that the program can find the randomized stack names

set -euo pipefail
shopt -s globstar

root="$(pwd)"
infrastructure="${root}/components/_infrastructure"
source test-config.sh

if [ -z ${INTEG_STACK_TAG+x} ]; then
    echo "INTEG_STACK_TAG must be set, exiting..."
    exit 1
fi

for component in **/cdk.json; do
    component_root="$(dirname "$component")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$component_root")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$component_root" && "./scripts/bash/destroy-stacks.sh"
    fi
done

if [ -z ${SAVE_INFRASTRUCTURE+x} ]; then
    cd "$infrastructure" && npx cdk destroy "*" -f
fi

cd "$root"

yarn run clean