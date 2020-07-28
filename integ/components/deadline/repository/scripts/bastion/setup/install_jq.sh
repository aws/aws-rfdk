#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to install jq module for extracting info from JSON files.
# The script will check whether jq is installed already. If it is, then it will do
# nothing.
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

set -eou pipefail

SCRIPT_LOC="$(dirname "$0")"

# Only install jq if it is not already on the system
if ! which jq
then
    sudo yum install -y jq
fi

exit 0