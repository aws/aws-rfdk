#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to submit a sample job to the render farm
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# Send job to Deadline
$DEADLINE/deadlinecommand SubmitCommandLineJob -executable "/usr/bin/sleep" -arguments "10" -frames "1-10" -name "sleeptest"

exit 0
