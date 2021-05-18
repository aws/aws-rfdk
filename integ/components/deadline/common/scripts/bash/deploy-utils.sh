#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This hook function is meant to be run before any interactions with AWS (such as a cdk deploy or destroy)
function run_aws_interaction_hook() {
    # Invoke hook function if it is exported and name is defined in PRE_AWS_INTERACTION_HOOK variable
    if [ ! -z "${PRE_AWS_INTERACTION_HOOK+x}" ] && [ "$(type -t $PRE_AWS_INTERACTION_HOOK)" == "function" ]
    then
      $PRE_AWS_INTERACTION_HOOK
    fi
}

function ensure_component_artifact_dir () {
  component_name=$1
  # Ensure component artifact sub-directory exists
  mkdir -p "${INTEG_TEMP_DIR}/${component_name}"
}

function deploy_component_stacks () {
  COMPONENT_NAME=$1

  echo "[${COMPONENT_NAME}] started"

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  # Generate the cdk.out directory which includes a manifest.json file
  # this can be used to determine the deployment ordering
  echo "[${COMPONENT_NAME}] synthesizing started"
  npx cdk synth &> "${INTEG_TEMP_DIR}/${COMPONENT_NAME}/synth.log"
  echo "[${COMPONENT_NAME}] synthesizing complete"

  echo "[${COMPONENT_NAME}] app deployment started"

  # Empty the deploy log file in case it was non-empty
  deploy_log_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/deploy.txt"
  cp /dev/null "${deploy_log_path}"

  for stack in $(cdk_stack_deploy_order); do
    run_aws_interaction_hook

    echo "[${COMPONENT_NAME}] -> [${stack}] stack deployment started"
    npx cdk deploy --app cdk.out --require-approval=never -e "${stack}" &>> "${deploy_log_path}"
    echo "[${COMPONENT_NAME}] -> [${stack}] stack deployment complete"
  done

  echo "[${COMPONENT_NAME}] app deployment complete"
  
  return 0
}

function cdk_stack_deploy_order () {
  # Outputs the stacks in topological deploy order
  "${INTEG_ROOT}/scripts/node/stack-order"
}

function cdk_stack_destroy_order () {
  # Outputs the stacks in topological destroy order
  "${INTEG_ROOT}/scripts/node/stack-order" -r
}

function execute_component_test () {
  COMPONENT_NAME=$1

  run_aws_interaction_hook

  test_report_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/test-report.json"
  test_output_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/test-output.txt"

  echo "[${COMPONENT_NAME}] running test suite started"
  ensure_component_artifact_dir "${COMPONENT_NAME}"
  yarn run test "$COMPONENT_NAME.test" --json --outputFile="${test_report_path}" &> "${test_output_path}"
  echo "[${COMPONENT_NAME}] running test suite complete"


  if [[ -f "${test_report_path}" && $(node -pe "require('${test_report_path}').numFailedTests") -eq 0 ]]
  then
    echo "[${COMPONENT_NAME}] test suite passed"
  else
    echo "[${COMPONENT_NAME}] test suite failed"
  fi

  return 0
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  echo "[${COMPONENT_NAME}] app destroy started"

  destroy_log_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/destroy.txt"
  # Empty the destroy log file in case it was non-empty
  cp /dev/null "${destroy_log_path}"
  for stack in $(cdk_stack_destroy_order); do
    run_aws_interaction_hook

    echo "[${COMPONENT_NAME}] -> [${stack}] stack destroy started"
    npx cdk destroy --app cdk.out -e -f "${stack}" &>> "${destroy_log_path}"
    echo "[${COMPONENT_NAME}] -> [${stack}] stack destroy complete"
  done

  # Clean up artifacts
  rm -f "./cdk.context.json"
  rm -rf "./cdk.out"

  echo "[${COMPONENT_NAME}] app destroy complete"

  return 0
}
