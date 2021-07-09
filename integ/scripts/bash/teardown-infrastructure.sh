#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

source "$INTEG_ROOT/components/deadline/common/scripts/bash/deploy-utils.sh"

echo "$(timestamp) [infrastructure] destroy started"
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"

run_aws_interaction_hook "$(timestamp) [infrastructure]"

mkdir -p "${INTEG_TEMP_DIR}/infrastructure"

# Hide the destroy log unless something goes wrong (save the scrollback buffer)
npx cdk destroy "*" -f &> "${INTEG_TEMP_DIR}/infrastructure/destroy.txt"
destroy_exit_code=$?

# If an exit code was returned from the destroy, output the destroy log
if [[ $destroy_exit_code -ne 0 ]]
then
    echo "$(timestamp) [infrastructure] destroy failed"
    cat "${INTEG_TEMP_DIR}/infrastructure/destroy.txt"
else
    echo "$(timestamp) [infrastructure] destroy complete"
fi

exit $destroy_exit_code
