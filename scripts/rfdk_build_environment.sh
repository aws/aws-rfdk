#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This is a helper script for entering a docker build environment suitable for
# building the RFDK. To use: Run this script from the root directory of the RFDK
# repository.

# Make sure we're running from the root of the CDK repo
if ! test -f package.json || ! grep '"name": "aws-rfdk-project",' package.json > /dev/null || ! grep '"private": true,' package.json > /dev/null
then
    echo "Usage: Run from the root of the RFDK repository"
    exit 1
fi

echo "Entering jsii/superchain docker container so you can interactively build/test RFDK."

USER_OPT="-u $(id -u):$(id -g)"
USERFILE_MOUNTS="-v /etc/passwd:/etc/passwd:ro -v /etc/shadow:/etc/shadow:ro -v /etc/group:/etc/group:ro"

# Share the config directories for language tools in the container.
OTHER_MOUNTS=""
for dir in "${HOME}/.npm" "${HOME}/.dotnet" "${HOME}/.templateengine" "${HOME}/.yarn" "${HOME}/.jsii-cache"
do
  test -d ${dir} || mkdir ${dir}
  OTHER_MOUNTS="${OTHER_MOUNTS} -v ${dir}:${dir}:rw"
done
for file in "${HOME}/.yarnrc"
do
  test -f ${file} || touch ${file}
  OTHER_MOUNTS="${OTHER_MOUNTS} -v ${file}:${file}:rw"
done

# Add the user's ~/.gitconfig if there is one.
test -f "${HOME}/.gitconfig" && OTHER_MOUNTS="${OTHER_MOUNTS} -v ${HOME}/.gitconfig:${HOME}/.gitconfig:ro"

docker run --rm \
    ${USERFILE_MOUNTS} \
    ${OTHER_MOUNTS} \
    -v ${PWD}:${PWD} -w ${PWD} \
    ${USER_OPT} \
    --net=host -it \
    --env DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    jsii/superchain:node14

