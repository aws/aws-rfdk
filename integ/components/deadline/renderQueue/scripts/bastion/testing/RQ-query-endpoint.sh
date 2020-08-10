#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to contact the render queue endpoint to test that it can accept requests
#
# Input:
#   ENDPOINT: Endpoint destination for the render queue being queried
# Output:
#   Non-zero return code on failure.

set -euo pipefail

ENDPOINT=$1
CERT="$(pwd)/cert"

# If a user-created CERT file is present, set up certificate for authenticating TLS
if [ -d "$CERT" ]; then
  # Adding https to the endpoint is necessary to use curl
  ENDPOINT="https://"${ENDPOINT}
  CURL_ARGS="$ENDPOINT -s --cacert ./cert/ca-cert.crt"
else
  CURL_ARGS="$ENDPOINT -s"
fi

# Make contact with the render queue endpoint
curl $CURL_ARGS

exit 0
