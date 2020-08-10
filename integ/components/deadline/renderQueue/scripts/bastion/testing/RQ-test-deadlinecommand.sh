#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to send a sample Deadline command to test connection to the render queue
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# Perform basic command on render queue
$DEADLINE/deadlinecommand Users

exit 0
