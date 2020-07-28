#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

cat /etc/mongod.conf | python ./setupMongodNoAuth.py > ./mongod.conf.new
sudo mv ./mongod.conf.new /etc/mongod.conf
# Make sure mongod user can read the config file
sudo chmod 640 /etc/mongod.conf
sudo chown root.mongod /etc/mongod.conf 