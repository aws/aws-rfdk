#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
shopt -s globstar

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"
mkdir -p "${INTEG_TEMP_DIR}/infrastructure"
echo "$(date "+%Y-%m-%dT%H:%M:%S") [infrastructure] deployment started"

# Handle errors manually
set +e

# Hide the deploy log unless something goes wrong (save the scrollback buffer)
npx cdk deploy "*" --concurrency 10 --require-approval=never --output "$(pwd)/cdk.out" --app "npx ts-node --cwd $(pwd) bin/_infrastructure.ts" &> "${INTEG_TEMP_DIR}/infrastructure/deploy.txt"
deploy_exit_code=$?

# If an exit code was returned from the deployment, output the deploy log
if [[ $deploy_exit_code -ne 0 ]]
then
    echo "$(date "+%Y-%m-%dT%H:%M:%S") [infrastructure] deployment failed"
    cat "${INTEG_TEMP_DIR}/infrastructure/deploy.txt"
else
    echo "$(date "+%Y-%m-%dT%H:%M:%S") [infrastructure] deployment complete"
fi

cd "$INTEG_ROOT"

exit $deploy_exit_code
