#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script is meant to perform the steps necessary to prepare a merge request for a release.
# - Enable the docker Daemon
# - Build and Publish all Lambda Layers
# - Run the Bump script

set -euxo pipefail

SCRIPT_DIR=$(dirname $0)
SCRIPT_DIR=$(readlink -f $SCRIPT_DIR)
ROOT_DIR=$(readlink -f "${SCRIPT_DIR}/..")

#Ensure that the docker daemon is running in the background
docker info || nohup /usr/bin/dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --storage-driver=overlay2&
timeout 15 sh -c "until docker info; do echo .; sleep 1; done"

# Build and publish lambda layers
/bin/bash ${SCRIPT_DIR}/publish-all-lambda-layers.sh

# Perform the bump
/bin/bash ${ROOT_DIR}/bump.sh