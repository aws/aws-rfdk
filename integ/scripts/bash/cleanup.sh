#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to clear up extra files between deployments of the integration test framework
# The script searches for test components configured in the framework and removes the cdk.context.json file and the cdk.out directory from each one where they exist
# Then, it deletes the integ/node_modules directory so they can be reinstalled

set -euo pipefail
shopt -s globstar

INTEG_ROOT="$(pwd)"

for COMPONENT in **/cdk.json; do
    # In case the yarn install was done inside this integ package, there are some example cdk.json files in the aws-cdk
    # package we want to avoid.
    if [[ $COMPONENT == *"node_modules"* ]]; then
        continue
    fi

    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    rm -f "${COMPONENT_ROOT}/cdk.context.json"
    rm -rf "${COMPONENT_ROOT}/cdk.out"
done

rm -rf "$INTEG_ROOT/node_modules"
