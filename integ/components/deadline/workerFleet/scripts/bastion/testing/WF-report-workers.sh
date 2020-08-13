#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to fetch names of workers associated with the configured render queue
#
# Input:
#   None
# Output:
#   A list of names of the workers attached to the render farm

set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# List workers associated with renderqueue
$DEADLINE/deadlinecommand Slaves

exit 0
