#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Removes renderqueue certification file made by `fetch-cert.sh` between test runs
#
# Input:
#   None
# Output:
#   Non-zero return code on failure.

rm -rf "./cert"

exit 0
