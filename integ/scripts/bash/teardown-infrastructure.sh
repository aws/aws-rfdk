#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

echo "Test suites completed. Destroying infrastructure stack..."
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"
npx cdk destroy "*" -f
echo "Infrastructure stack destroyed."

exit 0
