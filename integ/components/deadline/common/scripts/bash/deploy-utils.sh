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
  if [ "${RUN_TESTS_IN_PARALLEL-}" = true ]; then
    npx cdk deploy "*" --require-approval=never > "$INTEG_TEMP_DIR/${COMPONENT_NAME}_deploy.txt" 2>&1
  else
    npx cdk deploy "*" --require-approval=never
  fi
  echo "Test app $COMPONENT_NAME deployed."
  
  return 0
}

function execute_component_test () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  echo "Running test suite $COMPONENT_NAME..."
  if [ "${RUN_TESTS_IN_PARALLEL-}" = true ]; then
    yarn run test "$COMPONENT_NAME.test" --json --outputFile="$INTEG_TEMP_DIR/$COMPONENT_NAME.json" > "$INTEG_TEMP_DIR/${COMPONENT_NAME}.txt" 2>&1
  else
    yarn run test "$COMPONENT_NAME.test" --json --outputFile="$INTEG_TEMP_DIR/$COMPONENT_NAME.json"
  fi
  echo "Test suite $COMPONENT_NAME complete."

  return 0
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  echo "Destroying test app $COMPONENT_NAME..."
  if [ "${RUN_TESTS_IN_PARALLEL-}" = true ]; then
    npx cdk destroy "*" -f > "$INTEG_TEMP_DIR/${COMPONENT_NAME}_destroy.txt" 2>&1
  else
    npx cdk destroy "*" -f
  fi
  rm -f "./cdk.context.json"
  rm -rf "./cdk.out"
  echo "Test app $COMPONENT_NAME destroyed."

  return 0
}
