#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if [ $EXECUTE_DEADLINE_REPOSITORY_TEST_SUITE = true ]; then

    echo "Running Deadline Repository end-to-end test..."

    # Deploy a test app using the first configuration, run all jest tests, then tear the app down
    echo "Deploying test app for Deadline Repository test suite"
    npx cdk deploy "*" --require-approval=never
    echo "Test app deployed. Running test suite..."
    npm run test deadline-repository
    echo "Test suite complete. Destroying test app..."
    npx cdk destroy "*" -f
    rm -f "./cdk.context.json"
    rm -rf "./cdk.out"
    echo "Test app destroyed."
    echo "Deadline Repository tests complete."
fi
