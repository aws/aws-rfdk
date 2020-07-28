#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

cat "/mnt/efs/fs${1}/DeadlineRepository/settings/repository.ini"
