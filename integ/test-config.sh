#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Configure test suites to include in end-to-end test
export EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE=true
export EXECUTE_DEADLINE_RENDERQ_TEST_SUITE=true
export EXECUTE_DEADLINE_WORKER_TEST_SUITE=true

# Version of Deadline to install on farm resources.
#   -  If not set here, will default to 10.1.9.2
export DEADLINE_VERSION

# Qualified path to staged Deadline assets. 
#   - If not set here, assets will stage automatically to `aws-rfdk/integ/stage`
#   - If set here, the version found in `manifest.json` at this path will override any value supplied for DEADLINE_VERSION
export DEADLINE_STAGING_PATH

# Options for Deadline Repository test component
# Accept SSPL license to install MongoDB
#   - If not set to `true` here, the Repository test component will fail immediately on execution
export USER_ACCEPTS_SSPL_FOR_RFDK_TESTS=false

# Options for Deadline WorkerInstanceFleet test component
# EC2 AMIs to use for Deadline workers
#   - If not set here, the appropriate basic worker AMI for the version of Deadline and region will be pulled from the public directory
export LINUX_DEADLINE_AMI_ID
export WINDOWS_DEADLINE_AMI_ID