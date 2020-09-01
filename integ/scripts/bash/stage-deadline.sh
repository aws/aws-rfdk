#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Check if Deadline assets are staged at configured path
if [ ! $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    # Stage Deadline assets
    npx --package=aws-rfdk@$RFDK_VERSION stage-deadline --deadlineInstallerURI "s3://thinkbox-installers/Deadline/$DEADLINE_VERSION/Linux/DeadlineClient-$DEADLINE_VERSION-linux-x64-installer.run" --dockerRecipesURI "s3://thinkbox-installers/DeadlineDocker/$DEADLINE_VERSION/DeadlineDocker-$DEADLINE_VERSION.tar.gz" --output "$DEADLINE_STAGING_PATH"
fi

exit 0
