#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to install Deadline client on Bastion instance to test Deadline commands
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

set -xeou pipefail

sudo yum install -y lsb
sudo ./deadline-client-installer.run --mode unattended
