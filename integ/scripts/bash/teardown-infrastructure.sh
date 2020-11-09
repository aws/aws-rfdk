#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

echo "Test suites completed. Destroying infrastructure stack..."
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"

# Invoke hook function if it is exported and name is defined in PRE_COMPONENT_HOOK variable
if [ ! -z "${PRE_COMPONENT_HOOK+x}" ]  && [ "$(type -t $PRE_COMPONENT_HOOK)" == "function" ]
then
  $PRE_COMPONENT_HOOK
fi

npx cdk destroy "*" -f
echo "Infrastructure stack destroyed."

exit 0
