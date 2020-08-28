#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to run end to end test for configured RFDK components
# Configuration information for each test is drawn from integ/test-config.sh
# Script handles stack deployment, execution of the necessary tests, and teardown
# 

set -euo pipefail
shopt -s globstar

INTEG_ROOT="$(pwd)"

# RFDK version is passed in as first argument (taken from package.json)
RFDK_VERSION=$1

# Load variables from config file
echo "Loading config..."
source "./test-config.sh"

# Make sure SSPL license has been accepted if running repository test
if [ $EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE == true ]; then
    if [ $USER_ACCEPTS_SSPL_FOR_RFDK_TESTS != true ]; then
        echo "Error: SSPL license has not been accepted for repository test; test will not run. See README.md for details"
        exit 1
    fi
fi

# Get region from CDK_DEFAULT_REGION; assume us-west-2 if it's not set
if [ -z ${CDK_DEFAULT_REGION+x} ]; then
    export AWS_REGION="us-west-2"
else
    export AWS_REGION=$CDK_DEFAULT_REGION
fi

# Set staging path to default if not overridden
if [ -z ${DEADLINE_STAGING_PATH+x} ]; then
    DEADLINE_STAGING_PATH="$INTEG_ROOT/stage"
else
    #If path is set, extract the Deadline version to use for Deadline installations on the farm. This will override any other Deadline version provided.
    export DEADLINE_VERSION=$(node -e $'const json = require(process.argv[1] + \'/manifest.json\'); console.log(json.version)' "$DEADLINE_STAGING_PATH")
fi

# Set Deadline version to default if not overridden
if [ -z ${DEADLINE_VERSION+x} ]; then
    DEADLINE_VERSION="10.1.9.2"
fi

# Check if Deadline assets are staged at configured path
if [ ! $(ls "$DEADLINE_STAGING_PATH/manifest.json" 2> /dev/null) ]; then
    # Stage Deadline assets
    npx --package=aws-rfdk@$RFDK_VERSION stage-deadline --deadlineInstallerURI "s3://thinkbox-installers/Deadline/$DEADLINE_VERSION/Linux/DeadlineClient-$DEADLINE_VERSION-linux-x64-installer.run" --dockerRecipesURI "s3://thinkbox-installers/DeadlineDocker/$DEADLINE_VERSION/DeadlineDocker-$DEADLINE_VERSION.tar.gz" --output "$DEADLINE_STAGING_PATH"
fi

# If executing worker fleet tests, find Deadline AMIs based on supplied version
if [ $EXECUTE_DEADLINE_WORKER_TEST_SUITE == true ]; then
    # Only pull AMI ids if one of these variables is not already set
    if [ -z ${LINUX_DEADLINE_AMI_ID+x} ] || [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
        DEADLINE_RELEASE=$(sed 's/\(.*\..*\..*\)\..*/\1/' <<< $DEADLINE_VERSION)
        curl https://awsportal.s3.amazonaws.com/$DEADLINE_RELEASE/Release/amis.json --silent -o "./amis.json"
        if [ -z ${LINUX_DEADLINE_AMI_ID+x} ]; then
            export LINUX_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./amis.json\'); console.log(json[process.argv[1]].worker["ami-id"])' "$AWS_REGION")
        fi
        if [ -z ${WINDOWS_DEADLINE_AMI_ID+x} ]; then
            export WINDOWS_DEADLINE_AMI_ID=$(node -e $'const json = require(\'./amis.json\'); console.log(json[process.argv[1]].windowsWorker["ami-id"])' "$AWS_REGION")
        fi
    fi
fi

# Create a unique tag to add to stack names and some resources
if [ -z ${INTEG_STACK_TAG+x} ]; then
    export INTEG_STACK_TAG="$(date +%s%N)"
fi

echo "Starting RFDK-integ end-to-end tests"

# Deploy the infrastructure app, a cdk app containing only a VPC to be supplied to the following tests
INFRASTRUCTURE_APP="$INTEG_ROOT/components/_infrastructure"
cd "$INFRASTRUCTURE_APP"
echo "Deploying RFDK-integ infrastructure..."
npx cdk deploy "*" --require-approval=never
echo "RFDK-integ infrastructure deployed."
cd "$INTEG_ROOT"

# Pull the top level directory for each cdk app in the components directory
for COMPONENT in **/cdk.json; do
    COMPONENT_ROOT="$(dirname "$COMPONENT")"
    # Use a pattern match to exclude the infrastructure app from the results
    if [[ "$(basename "$COMPONENT_ROOT")" != _* ]]; then
        # Excecute the e2e test in the component's scripts directory
        cd "$INTEG_ROOT/$COMPONENT_ROOT" && "./scripts/bash/e2e.sh"
    fi
done

# Destroy the infrastructure stack on completion
echo "Test suites completed. Destroying infrastructure stack..."
cd "$INFRASTRUCTURE_APP"
npx cdk destroy "*" -f

echo "Infrastructure stack destroyed."
cd "$INTEG_ROOT"

echo "Cleaning up folders..."
yarn run clean

echo "Complete!"

exit 0
