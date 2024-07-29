#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Accept SSPL license to install MongoDB
#   - If not set to `true` here, the Repository test component will fail immediately on execution
export USER_ACCEPTS_SSPL_FOR_RFDK_TESTS=true

# Version of Deadline to install on farm resources.
#   -  If not set here, will default to the latest
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

# The ARN of the Secret containing a zip file with the UBL certificates to use.
#   - If unspecified, a secret will be created that contains dummy certificates.
#   - If this is specified, UBL_LICENSE_MAP must be specified as well.
#   - For more info, please see https://docs.thinkboxsoftware.com/products/deadline/10.2/1_User%20Manual/manual/licensing-usage-based.html#third-party-usage-based-licensing
export UBL_CERTIFICATE_BUNDLE_SECRET_ARN

# Map of UBL licenses and the limits for them.
#   - This must be specified if UBL_CERTIFICATE_BUNDLE_SECRET_ARN is specified, otherwise this is ignored.
#   - Expected format is a JSON object where the keys are the name of a product in PascalCase,
#     and the values are numbers that represent the UBL limit. A limit of 0 is treated as unlimited UBL.
#   - To see all supported licenses, see the static `for...()` methods in the UsageBasedLicense class in RFDK.
#
# Example:
# {
#   "Maya": 10,
#   "Cinema4D": 0,
#   // ...
# }
export UBL_LICENSE_MAP


# EC2 AMIs to use for Deadline workers
#   - If not set here, the appropriate basic worker AMI for the version of Deadline and region will be pulled from the public directory
export LINUX_DEADLINE_AMI_ID
export WINDOWS_DEADLINE_AMI_ID

# Configure test suites to include in end-to-end test
export SKIP_deadline_01_repository_TEST
export SKIP_deadline_02_renderQueue_TEST
export SKIP_deadline_03_workerFleetHttp_TEST
export SKIP_deadline_04_workerFleetHttps_TEST
export SKIP_deadline_05_secretsManagement_TEST

# All test suites will be run in parallel
export RUN_TESTS_IN_PARALLEL=false
