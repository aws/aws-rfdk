#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to download the contents of a Secret from AWS SecretsManager, and save
# the contents to a file
#
# Arguments:
#   $1 -- The ARN of the secret to fetch
#   $2 -- The filename to save the contents as.

set -xefuo pipefail

if test $# -lt 2
then
    echo "Usage: $0 <secret arn> <filename>"
    exit 1
fi

SECRET_ARN=$1
OUTPUT_FILENAME=$2
AWS_REGION=$(echo ${SECRET_ARN} | cut -d: -f 4)

OUTPUT_DIR=$(dirname "${OUTPUT_FILENAME}")
[ -d "${OUTPUT_DIR}" ] || sudo mkdir -p "${OUTPUT_DIR}"

PY_SCRIPT="from __future__ import print_function; import json, sys; d=json.load(sys.stdin); print(d[sys.argv[1]])"

set +x
export SECRET_JSON=$(aws --region ${AWS_REGION} secretsmanager get-secret-value --secret-id ${SECRET_ARN})
set -x
if printenv SECRET_JSON | grep 'SecretString' 2>&1 > /dev/null
then
    # Secret was plain test. Just copy the contents of the SecretString into the output file
    printenv SECRET_JSON | python -c "${PY_SCRIPT}" SecretString > "${OUTPUT_FILENAME}"
else
    # Secret value is binary. The contents of SecretBinary will be the base64 encoding of the secret
    printenv SECRET_JSON | python -c "${PY_SCRIPT}" SecretBinary | base64 -w0 -i -d > "${OUTPUT_FILENAME}"
fi
unset SECRET_JSON
