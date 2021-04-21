#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to return the username for the process running the RCS as reported by Deadline
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.
#   Outputs the username of the process that the Deadline RCS is running as


set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# Fetch repository.ini from the Deadline repo
$DEADLINE/deadlinecommand -json GetProxyServerInfos | jq -e -r '.result[]|select(.Stat == 1 and .Type == "Remote")|.User'
