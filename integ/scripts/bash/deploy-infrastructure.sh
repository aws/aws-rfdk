#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"
echo "Deploying RFDK-integ infrastructure..."
npx cdk deploy "*" --require-approval=never || cleanup_on_failure
echo "RFDK-integ infrastructure deployed."
cd "$INTEG_ROOT"

exit 0