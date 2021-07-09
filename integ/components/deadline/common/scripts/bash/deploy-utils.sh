#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This hook function is meant to be run before any interactions with AWS (such as a cdk deploy or destroy)
function run_aws_interaction_hook() {
    # Invoke hook function if it is exported and name is defined in PRE_AWS_INTERACTION_HOOK variable
    if [ ! -z "${PRE_AWS_INTERACTION_HOOK+x}" ] && [ "$(type -t $PRE_AWS_INTERACTION_HOOK)" == "function" ]
    then
      $PRE_AWS_INTERACTION_HOOK "${1:-}"
    fi
}

function ensure_component_artifact_dir () {
  component_name=$1
  # Ensure component artifact sub-directory exists
  mkdir -p "${INTEG_TEMP_DIR}/${component_name}"
}

function deploy_component_stacks () {
  COMPONENT_NAME=$1

  echo "$(timestamp) [${COMPONENT_NAME}] app deployment started"

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  # Generate the cdk.out directory which includes a manifest.json file
  # this can be used to determine the deployment ordering
  echo "$(timestamp) [${COMPONENT_NAME}] synthesizing started"
  # Synthesis requires AWS API calls for the context methods
  # (https://docs.aws.amazon.com/cdk/latest/guide/context.html#context_methods)
  # in our case this is for stack.availabilityZones
  run_aws_interaction_hook "$(timestamp) [${COMPONENT_NAME}]"

  npx cdk synth &> "${INTEG_TEMP_DIR}/${COMPONENT_NAME}/synth.log"
  SYNTH_EXIT_CODE=$?
  echo $SYNTH_EXIT_CODE > "${INTEG_TEMP_DIR}/${COMPONENT_NAME}/synth-exit-code"
  if [[ $SYNTH_EXIT_CODE -ne 0 ]]
  then
    echo "$(timestamp) [${COMPONENT_NAME}] synthesizing failed"
    echo "$(timestamp) [${COMPONENT_NAME}] app deployment failed"
    return $SYNTH_EXIT_CODE
  fi
  echo "$(timestamp) [${COMPONENT_NAME}] synthesizing complete"

  echo "$(timestamp) [${COMPONENT_NAME}] app deployment started"

  # Empty the deploy log file in case it was non-empty
  deploy_log_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/deploy.txt"
  cp /dev/null "${deploy_log_path}"

  for stack in $(cdk_stack_deploy_order); do
    run_aws_interaction_hook "$(timestamp) [${COMPONENT_NAME}]"

    echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack deployment started"
    npx cdk deploy --app cdk.out --require-approval=never -e "${stack}" &>> "${deploy_log_path}"
    STACK_DEPLOY_EXIT_CODE=$?
    if [[ $STACK_DEPLOY_EXIT_CODE -ne 0 ]]
    then
      # Save exit code
      echo $STACK_DEPLOY_EXIT_CODE > "${INTEG_TEMP_DIR}/${COMPONENT_NAME}/deploy-exit-code"

      echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack deployment failed"
      echo "$(timestamp) [${COMPONENT_NAME}] app deployment failed"
      return $STACK_DEPLOY_EXIT_CODE
    fi
    echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack deployment complete"
  done

  echo 0 > "${INTEG_TEMP_DIR}/${COMPONENT_NAME}/deploy-exit-code"

  echo "$(timestamp) [${COMPONENT_NAME}] app deployment complete"
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

  run_aws_interaction_hook "$(timestamp) [${COMPONENT_NAME}]"

  test_report_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/test-report.json"
  test_output_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/test-output.txt"

  ensure_component_artifact_dir "${COMPONENT_NAME}"
  yarn run test "$COMPONENT_NAME.test" --json --outputFile="${test_report_path}" &> "${test_output_path}"
}

function destroy_component_stacks () {
  COMPONENT_NAME=$1

  ensure_component_artifact_dir "${COMPONENT_NAME}"

  echo "$(timestamp) [${COMPONENT_NAME}] app destroy started"

  destroy_log_path="${INTEG_TEMP_DIR}/${COMPONENT_NAME}/destroy.txt"
  # Empty the destroy log file in case it was non-empty
  cp /dev/null "${destroy_log_path}"
  for stack in $(cdk_stack_destroy_order); do
    run_aws_interaction_hook "$(timestamp) [${COMPONENT_NAME}]"

    echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack destroy started"
    npx cdk destroy --app cdk.out -e -f "${stack}" &>> "${destroy_log_path}"
    STACK_DESTROY_EXIT_CODE=$?
    if [[ $STACK_DESTROY_EXIT_CODE -ne 0 ]]
    then
      echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack destroy failed"
      echo "$(timestamp) [${COMPONENT_NAME}] app destroy failed"
      return $STACK_DESTROY_EXIT_CODE
    fi
    echo "$(timestamp) [${COMPONENT_NAME}] -> [${stack}] stack destroy complete"
  done

  echo "$(timestamp) [${COMPONENT_NAME}] app destroy complete"
}

function timestamp() {
  date "+%Y-%m-%dT%H:%M:%S"
}
