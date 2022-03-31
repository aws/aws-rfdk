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

if [ ! -z ${ROLE_ARN+x} ] && \
   [ ! -z ${ROLE_SESSION_NAME+x} ] && \
   [ ! -z ${ROLE_EXTERNAL_ID+x} ]; then

  unset AWS_ACCESS_KEY_ID
  unset AWS_SECRET_ACCESS_KEY
  unset AWS_SESSION_TOKEN

  TEST_PROFILE_NAME=integtestrunner
  # Set up the default profile to dynamically assume-role to the given ROLE_ARN whenever the credentials
  # need to be refreshed.
  # Reference: https://docs.aws.amazon.com/cli/latest/topic/config-vars.html#using-aws-iam-roles
  aws configure --profile ${TEST_PROFILE_NAME} set role_arn ${ROLE_ARN}
  aws configure --profile ${TEST_PROFILE_NAME} set external_id ${ROLE_EXTERNAL_ID}
  aws configure --profile ${TEST_PROFILE_NAME} set role_session_name ${ROLE_SESSION_NAME}

  if [ ! -z ${CODEBUILD_BUILD_NUMBER} ]
  then
    # Running in a CodeBuild container.
    # ref: https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html
    echo "Running in ECS"
    aws configure --profile ${TEST_PROFILE_NAME} set credential_source EcsContainer
  elif curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 5" 2> /dev/null >& /dev/null
  then
    # Running on an EC2 instance
    echo "Running on EC2"
    aws configure --profile ${TEST_PROFILE_NAME} set credential_source Ec2InstanceMetadata
  else
    # Not a container or EC2 instance. Use the AWS_PROFILE profile for the source credentials
    # for the assume-role; default to the 'default' profile is there is no AWS_PROFILE defined.
    echo "Non-AWS local run environment"
    aws configure --profile ${TEST_PROFILE_NAME} set source_profile ${AWS_PROFILE:-default}
  fi

  # Work around a CDK bug: https://github.com/aws/aws-cdk/issues/3396#issuecomment-990609132
  touch ~/.aws/credentials

  # Must be the last thing that we do in this code path.
  export AWS_PROFILE=${TEST_PROFILE_NAME}
  export AWS_STS_REGIONAL_ENDPOINTS=regional
fi

# Basic integ test configuration
export SKIP_TEST_CONFIG=true

./scripts/bash/rfdk-integ-e2e.sh

unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
unset AWS_PROFILE
