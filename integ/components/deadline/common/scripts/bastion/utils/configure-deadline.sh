#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to configure a Deadline installation to connect to the render queue and repository at a specified endpoint
#
# Input:
#   ENDPOINT: Endpoint destination for the render queue being queried
# Output:
#   Non-zero return code on failure.

set -euo pipefail

ENDPOINT=$1
DEADLINE="/opt/Thinkbox/Deadline10/bin"
CERT="$(pwd)/cert"

# If a user-created CERT file is present, set up certificate for authenticating TLS
if [ -d "$CERT" ]; then

  # Set up client connection settings for TLS by altering ini file with deadlinecommand
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ProxyUseSSL True
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ProxySSLCA "$CERT/ca-cert.crt"
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ClientSSLAuthentication NotRequired
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ProxyRoot $ENDPOINT

else
  # Non-TLS connections can connect to the repository directly
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ProxyUseSSL False
  sudo $DEADLINE/deadlinecommand SetIniFileSetting ProxySSLCA ""
  sudo $DEADLINE/deadlinecommand ChangeRepository Remote $ENDPOINT >/dev/null
fi

exit 0
