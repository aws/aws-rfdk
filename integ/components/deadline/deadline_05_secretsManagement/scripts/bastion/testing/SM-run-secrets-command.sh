#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to run a Deadline Secrets Management command.
#
# Input:
#   AWS_REGION: Region where stacks are deployed, taken from AWS.config
#   SM_CREDENTIALS_ARN: ID for the Secret containing username/password information for accessing Deadline Secrets Management
#   COMMAND: The Deadline Secrets Management command to run.
#   ARGS: (Optional Array) Arguments for the Deadline Secrets Management command.
# Output:
#   The output of the given Deadline Secrets Management command.
set -feuo pipefail

ARGS=($@)

AWS_REGION=$1
SM_CREDENTIALS_ARN=$2
COMMAND=$3
SM_CMD_ARGS=(${ARGS[@]:3})

DEADLINE_PATH="/opt/Thinkbox/Deadline10/bin"

SM_SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id=$SM_CREDENTIALS_ARN --region=$AWS_REGION)
SM_SECRET_STRING=$(jq -r '.SecretString' <<< "$SM_SECRET_VALUE")
SM_USERNAME=$(jq -r '.username' <<< "$SM_SECRET_STRING")
export SM_PASSWORD=$(jq -r '.password' <<< "$SM_SECRET_STRING")

# The syntax ${array[@]+"${array[@]}"} is a way to get around the expansion of an empty array raising an unbound variable error since this script
# sets the "u" shell option above. This is a use of the ${parameter+word} shell expansion. If the value of "parameter" is unset, nothing will be
# substituted in its place. If "parameter" is set, then the value of "word" is used, which is the expansion of the populated array.
# Since bash treats the expansion of an empty array as an unset variable, we can use this pattern expand the array only if it is populated.
"$DEADLINE_PATH/deadlinecommand" --json secrets $COMMAND "$SM_USERNAME" --password env:SM_PASSWORD ${SM_CMD_ARGS[@]+"${SM_CMD_ARGS[@]}"}

unset SM_PASSWORD
