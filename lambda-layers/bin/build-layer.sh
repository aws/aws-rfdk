#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script is meant to build a Lambda Layer using Docker. Its usage is:
#   build_layer.sh <layer_name>
# The layer_name should map to a directory under the layers directory. Full instructions on how to build and publish
# a Lambda Layer can be found in the README.

set -euo pipefail

if test $# -lt 1
then
    echo "Usage: $0 <directory>"
    echo "  Builds the layer located in <directory>"
    exit 1
fi

SCRIPT_DIR=$(dirname $0)
SCRIPT_NAME=$(basename $0)
if ! test -f ${PWD}/${SCRIPT_NAME}
then
    echo "Must be run from the directory containing ${SCRIPT_NAME}"
    exit 1
fi

LAYER_NAME=$(basename $1)
LAYER_DIR="${PWD}/../layers/${LAYER_NAME}"
if ! test -d "${LAYER_DIR}"
then
    echo "${LAYER_NAME} directory must a subdirectory of ${PWD}/../layers/"
    exit 1
fi

for file in layer.zip description.txt license.txt runtimes.txt
do
    test -f "${LAYER_DIR}/${file}" && rm -f "${LAYER_DIR}/${file}"
done

docker build -t "${LAYER_NAME}" "${LAYER_DIR}/"

# Run the docker container as the current user.
# For this to work we need to mount this machine's credentials files
# inside of the container as read-only.

USER_OPT="-u $(id -u):$(id -g)"
USERFILE_MOUNTS="-v /etc/passwd:/etc/passwd:ro -v /etc/shadow:/etc/shadow:ro -v /etc/group:/etc/group:ro"
docker run --rm \
    -v "${LAYER_DIR}":/tmp/layer ${USERFILE_MOUNTS} \
    ${USER_OPT} \
    "${LAYER_NAME}"
