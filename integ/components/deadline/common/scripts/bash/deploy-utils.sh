#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This hook function is meant to be run before any interactions with AWS (such as a cdk deploy or destroy)
function run_aws_interaction_hook() {
    # Invoke hook function if it is exported and name is defined in PRE_AWS_INTERACTION_HOOK variable
    if [ ! -z "${PRE_AWS_INTERACTION_HOOK+x}" ]  && [ "$(type -t $PRE_AWS_INTERACTION_HOOK)" == "function" ]
    then
      $PRE_AWS_INTERACTION_HOOK
    fi
}

function deploy_component_stacks () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  echo "Running $COMPONENT_NAME end-to-end test..."

  echo "Deploying test app for $COMPONENT_NAME test suite"
  npx cdk deploy "*" --require-approval=never
  echo "Test app $COMPONENT_NAME deployed."

  return 0
}

function execute_component_test () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  echo "Running test suite $COMPONENT_NAME..."
  yarn run test "$COMPONENT_NAME.test" --json --outputFile="./.e2etemp/$COMPONENT_NAME.json"
  echo "Test suite $COMPONENT_NAME complete."

  return 0
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  echo "Destroying test app $COMPONENT_NAME..."
  npx cdk destroy "*" -f
  rm -f "./cdk.context.json"
  rm -rf "./cdk.out"
  echo "Test app $COMPONENT_NAME destroyed."

  return 0
}
