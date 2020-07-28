#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to clear up extra files between deployments of the integration test framework
# The script searches for test components configured in the framework and removes the cdk.context.json file and the cdk.out directory from each one where they exist
# Then, it deletes the integ/node_modules directory so they can be reinstalled

set -euo pipefail
shopt -s globstar

root="$(pwd)"

for component in **/cdk.json; do
       component_root="$(dirname "$component")"
       rm -f "${component_root}/cdk.context.json"
       rm -rf "${component_root}/cdk.out"
 done

rm -rf "${root}/node_modules"
