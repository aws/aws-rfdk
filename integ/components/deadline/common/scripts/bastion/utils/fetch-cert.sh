#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to retrieve the authentication certificate for a render queue from a provided Secret
#
# Input:
#   AWS_REGION: Region where stacks are deployed, taken from AWS.config
#   SECRET_ARN: ARN for the Secret that has the value of the X.509 certificate needed to authenticate
#     the RCS TLS. If present, indicates that the render queue is secured by HTTPS and the ARN is used
#     to extract the key value of the cert.
# Output:
#   Non-zero return code on failure.

set -euo pipefail

AWS_REGION=$1
SECRET_ARN=$2
mkdir -p cert

# Extract the value of the Secret
export SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id=$SECRET_ARN --region=$AWS_REGION)
# Use jq to extract the SecretString (i.e. the key)
SECRET_STRING=$(jq '.SecretString' <<< "$SECRET_VALUE")
# Format away quotations/escape characters so the key will format correctly, then save it to a temporary file
SECRET_STRING=${SECRET_STRING#"\""}
SECRET_STRING=${SECRET_STRING%"\""}
echo -e $SECRET_STRING > "./cert/ca-cert.crt"

exit 0
