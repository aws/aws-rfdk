#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to query an EFS file sytem to retrieve the settings file for the Deadline repository
#
# Input:
#   MOUNT_ID: The test case id, which corresponds to the mount path for the EFS
# Output:
#   Non-zero exit code on failure
set -euo pipefail

MOUNT_ID=$1

cat "/mnt/efs/fs${MOUNT_ID}/DeadlineRepository/settings/repository.ini"

exit 0