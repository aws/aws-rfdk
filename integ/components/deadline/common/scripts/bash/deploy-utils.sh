#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

function deploy_component_stacks () {
  COMPONENT_NAME=$1
  echo "Running $COMPONENT_NAME end-to-end test..."

  echo "Deploying test app for $COMPONENT_NAME test suite"
  npx cdk deploy "*" --require-approval=never
  echo "Test app $COMPONENT_NAME deployed."
  
  return 0
}

function execute_component_test () {
  COMPONENT_NAME=$1
  echo "Running test suite $COMPONENT_NAME..."
  yarn run test "$COMPONENT_NAME.test" --json --outputFile="./.e2etemp/$COMPONENT_NAME.json"
  echo "Test suite $COMPONENT_NAME complete."

  return 0
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1
  echo "Destroying test app $COMPONENT_NAME..."
  npx cdk destroy "*" -f
  rm -f "./cdk.context.json"
  rm -rf "./cdk.out"
  echo "Test app $COMPONENT_NAME destroyed."

  return 0
}
