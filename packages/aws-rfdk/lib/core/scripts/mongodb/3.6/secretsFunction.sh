#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

function get_secret_string() {
  SECRET_ID=$1
  AWS_REGION=$(echo ${SECRET_ID} | cut -d: -f4)
  PYTHON_SCRIPT="import json,sys; d=json.load(sys.stdin); print d[\"SecretString\"];"
  set +x
  export RET_VALUE=$(aws --region ${AWS_REGION} secretsmanager get-secret-value --secret-id "${SECRET_ID}" | python -c "${PYTHON_SCRIPT}" )
  set -x
}
