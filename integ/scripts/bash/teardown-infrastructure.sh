#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

source "$INTEG_ROOT/components/deadline/common/scripts/bash/deploy-utils.sh"

echo "Test suites completed. Destroying infrastructure stack..."
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"

run_aws_interaction_hook

npx cdk destroy "*" -f
echo "Infrastructure stack destroyed."

exit 0
