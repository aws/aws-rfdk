#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Set up the live/secure configuration for mongo in preparation for starting the
# service for real.

set -xeufo pipefail

cat /etc/mongod.conf | python ./setupMongodLiveConfig.py > ./mongod.conf.new
sudo mv ./mongod.conf.new /etc/mongod.conf
# Make sure mongod user can read the config file
sudo chmod 640 /etc/mongod.conf
sudo chown root.mongod /etc/mongod.conf 