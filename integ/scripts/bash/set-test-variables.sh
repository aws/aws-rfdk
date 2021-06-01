#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

echo "Setting test variables..."

# Get region from CDK_DEFAULT_REGION; assume us-west-2 if it's not set
if [ -z ${CDK_DEFAULT_REGION+x} ]; then
    export AWS_REGION="us-west-2"
else
    export AWS_REGION=$CDK_DEFAULT_REGION
fi

if [ -z ${USER_ACCEPTS_SSPL_FOR_RFDK_TESTS+x} ]; then
    export USER_ACCEPTS_SSPL_FOR_RFDK_TESTS=false
fi


# Set staging path to default if not overridden
if [ -z ${DEADLINE_STAGING_PATH+x} ]; then
    export DEADLINE_STAGING_PATH="$INTEG_ROOT/stage"
elif [ $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    #If path is set, extract the Deadline version to use for Deadline installations on the farm. This will override any other Deadline version provided.
    export DEADLINE_VERSION=$(node -e $'const json = require(process.argv[1] + \'/manifest.json\'); console.log(json.version)' "$DEADLINE_STAGING_PATH")
fi
