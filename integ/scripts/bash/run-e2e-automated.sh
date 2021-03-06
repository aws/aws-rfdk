#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Used as the entry point to run the tests in an automated way. This expects the following env vars to be set:
# USER_ACCEPTS_SSPL_FOR_RFDK_TESTS - Needs to be 'true' to use these tests
#
# Each of these env vars must be set to assume an IAM role in a separate account.
# If at least one is not set, an IAM role will not be assumed.
# ROLE_ARN - The role that will be assumed to deploy the integ tests
# ROLE_SESSION_NAME - A name for the assume role session
# ROLE_EXTERNAL_ID - The external ID matching the assume role
# DEADLINE_VERSION - Optional, will default to the latest Deadline version if not set, otherwise the specified version will be used.

set -euo pipefail

refreshcreds() {
    echo "${1:-} Refreshing credentials"
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    unset AWS_SESSION_TOKEN

    # Save new credentials into an env var and then parse that env var to set up the 3 required env
    # vars for authenticated calls using AWS SDK/CDK
    export CREDS="$(AWS_STS_REGIONAL_ENDPOINTS=regional aws sts assume-role \
        --role-arn $ROLE_ARN \
        --role-session-name $ROLE_SESSION_NAME \
        --external-id $ROLE_EXTERNAL_ID)"
    export AWS_ACCESS_KEY_ID="$(printenv CREDS | grep "AccessKeyId" | cut -d'"' -f 4)"
    export AWS_SECRET_ACCESS_KEY="$(printenv CREDS | grep "SecretAccessKey" | cut -d'"' -f 4)"
    export AWS_SESSION_TOKEN="$(printenv CREDS | grep "SessionToken" | cut -d'"' -f 4)"
    # Clean up the env var
    unset CREDS
}

if [ ! -z ${ROLE_ARN+x} ] && \
   [ ! -z ${ROLE_SESSION_NAME+x} ] && \
   [ ! -z ${ROLE_EXTERNAL_ID+x} ]; then
  # Setup the hook that runs before any interactions with AWS to refresh the credentials being used.
  # There is a 1 hour timeout on these credentials that cannot be adjusted.
  export -f refreshcreds
  export PRE_AWS_INTERACTION_HOOK=refreshcreds

  refreshcreds
fi

# Basic integ test configuration
export SKIP_TEST_CONFIG=true

./scripts/bash/rfdk-integ-e2e.sh

unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
