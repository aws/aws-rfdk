#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

# Only pull AMI ids if one of these variables is not already set
if [ -z ${LINUX_DEADLINE_AMI_ID+x} ] || [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
    DEADLINE_RELEASE=$(sed 's/\(.*\..*\..*\)\..*/\1/' <<< $DEADLINE_VERSION)
    curl https://awsportal.s3.amazonaws.com/$DEADLINE_RELEASE/Release/amis.json --silent -o "$INTEG_TEMP_DIR/amis.json"
    if [ -z ${LINUX_DEADLINE_AMI_ID+x} ]; then
        export LINUX_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./.e2etemp/amis.json\'); console.log(json[process.argv[1]].worker["ami-id"])' "$AWS_REGION")
    fi
    if [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
        export WINDOWS_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./.e2etemp/amis.json\'); console.log(json[process.argv[1]].windowsWorker["ami-id"])' "$AWS_REGION")
    fi
fi
