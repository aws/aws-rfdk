#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Command-line arguments:
#  $1 -- Storage path of the MongoDB data.

set -xeufo pipefail

if test $# -lt 1
then
  echo "ERROR -- Incorrect number of options for script. See script header for usage."
  exit 1
fi

STORAGE_PATH=$1

cat /etc/mongod.conf | python ./setupMongodStorage.py "${STORAGE_PATH}" > ./mongod.conf.new
sudo mv ./mongod.conf.new /etc/mongod.conf
# Make sure mongod user can read the config file
sudo chmod 640 /etc/mongod.conf
sudo chown root.mongod /etc/mongod.conf 
