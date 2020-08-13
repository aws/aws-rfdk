#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if [ $EXECUTE_DEADLINE_WORKER_TEST_SUITE = true ]; then
  npx cdk deploy "*" --require-approval=never
fi
