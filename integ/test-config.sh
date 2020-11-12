#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Accept SSPL license to install MongoDB
#   - If not set to `true` here, the Repository test component will fail immediately on execution
export USER_ACCEPTS_SSPL_FOR_RFDK_TESTS=false

# Version of Deadline to install on farm resources.
#   -  If not set here, will default to 10.1.9.2
export DEADLINE_VERSION

# Qualified path to staged Deadline assets. 
#   - If not set here, assets will stage automatically to `aws-rfdk/integ/stage`
#   - If set here, the version found in `manifest.json` at this path will override any value supplied for DEADLINE_VERSION
export DEADLINE_STAGING_PATH

# Override for Deadline Docker images that will be used over the images that can be built via the staged Deadline Docker recipes
#   - If set, it must be a JSON string like:
#     {
#       "repositoryArn": <string>, (The ECR repository ARN)
#       "imageOverrides": {
#         <string>: <string>, (key = Deadline Docker recipe name (see ThinkboxManagedDeadlineDockerRecipes in aws-rfdk); value = tag of Docker image to use)
#         ...
#       }
#     }
export RFDK_DOCKER_IMAGE_OVERRIDES

# EC2 AMIs to use for Deadline workers
#   - If not set here, the appropriate basic worker AMI for the version of Deadline and region will be pulled from the public directory
export LINUX_DEADLINE_AMI_ID
export WINDOWS_DEADLINE_AMI_ID

# Configure test suites to include in end-to-end test
export SKIP_deadline_01_repository_TEST
export SKIP_deadline_02_renderQueue_TEST
export SKIP_deadline_03_workerFleet_TEST
