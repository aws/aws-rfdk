#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

function deploy_component_stacks () {
  COMPONENT_NAME=$1
  echo "Running $COMPONENT_NAME end-to-end test..."

  echo "Deploying test app for $COMPONENT_NAME test suite"
  npx cdk deploy "*" --require-approval=never
  echo "Test app deployed."
  
  return 0
}

function execute_component_test () {
  TEST_NAME=$1
  echo "Running test suite..."
  yarn run test "$TEST_NAME.test" --json --outputFile="./.e2etemp/$TEST_NAME.json"
  echo "Test suite complete."

  return 0
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1
  echo "Destroying test app..."
  npx cdk destroy "*" -f
  rm -f "./cdk.context.json"
  rm -rf "./cdk.out"
  echo "Test app destroyed."

  return 0
}
