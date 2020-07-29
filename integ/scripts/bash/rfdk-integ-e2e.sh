#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown
# 

set -euo pipefail
shopt -s globstar

root="$(pwd)"
infrastructure="${root}/components/_infrastructure"

echo "Loading config..."
source "${root}/test-config.sh"

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    # Create a unique tag to add to stack names and some resources
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

# Set location of output file
mkdir -p "test-output"
export OUTPUT_FILE="${root}/test-output/output-${INTEG_STACK_TAG}.txt"

echo "Starting RFDK-integ end-to-end tests" > "$OUTPUT_FILE"

# Run preflight checks to make sure necessary variables, etc. are set
jest --passWithNoTests --silent "preflight"

cd "$infrastructure"

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
echo "Deploying RFDK-integ infrastructure..." >> "$OUTPUT_FILE"
npx cdk deploy "*" --require-approval=never
echo "RFDK-integ infrastructure deployed." >> "$OUTPUT_FILE"
cd "$root"

# Pull the top level directory for each cdk app in the components directory
for component in **/cdk.json; do
    component_root="$(dirname "$component")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$component_root")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$component_root" && "./scripts/bash/e2e.sh"
    fi
done

# Destroy the infrastructure stack on completion
echo "Test suites completed. Destroying infrastructure stack..." >> "$OUTPUT_FILE"
cd "$infrastructure"
npx cdk destroy "*" -f

echo "Infrastructure stack destroyed." >> "$OUTPUT_FILE"
cd "$root"

echo "Cleaning up folders..."
yarn run clean

echo "Complete!" >> "$OUTPUT_FILE"
exit 0