#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script is meant to build and publish all Lambda Layers using Docker. Its usage is:
#   publish-all-lambda-layers.sh

set -euo pipefail


SCRIPT_DIR=$(dirname $0)

# Switch to the lambda layers directory
cd "$SCRIPT_DIR/../lambda-layers"

# install and build node packages
yarn
yarn build

# Find all layers
LAYER_NAMES=$(find ./layers -mindepth 1 -maxdepth 1 -printf "%f\n" -type d)

# Switch to the bin directory
cd bin
for LAYER in "${LAYER_NAMES[@]}"
do
    ./build-layer.sh "${LAYER}"
done

for LAYER in "${LAYER_NAMES[@]}"
do
    node ./publish.js "${LAYER}"
done

node ./write-ts.js "${LAYER_NAMES[@]}"
