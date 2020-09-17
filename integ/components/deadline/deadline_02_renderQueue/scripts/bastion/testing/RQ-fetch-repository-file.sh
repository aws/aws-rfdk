#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to fetch the repository.ini file from the repository at the RQ endpoint
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# Fetch repository.ini from the Deadline repo
$DEADLINE/deadlinecommand -GetRepositoryFilePath "settings/repository.ini"

exit 0
