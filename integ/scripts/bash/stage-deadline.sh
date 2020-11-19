#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

# Check if Deadline assets are staged at configured path
if [ ! $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    # If DEADLINE_VERSION is not defined set empty value to get the latest version
    if [ -z ${DEADLINE_VERSION+x} ]; then
        export DEADLINE_VERSION=""
    fi
    # Stage Deadline assets
    npx stage-deadline --output "$DEADLINE_STAGING_PATH" $DEADLINE_VERSION
fi

exit 0
