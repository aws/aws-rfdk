#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Set the open files limit to 200k so we don't have dropped/refused connections.
# Per mongo, the process limit should be 50% of the open file limit too.
SERVICE_FILE="/lib/systemd/system/mongod.service"
if test -e "${SERVICE_FILE}"
then
    if grep 'LimitNOFILE' "${SERVICE_FILE}"
    then
        # Note: Only change if the values are their defaults from the MongoDB rpm install.
        #  Customer might have created a custom AMI with their own limits.
        sudo sed --in-place=.bak -e 's/^LimitNOFILE=64000$/LimitNOFILE=200000/' -e 's/^LimitNPROC=64000$/LimitNPROC=100000/' "${SERVICE_FILE}"
    else
        echo "LimitNOFILE=200000" | sudo tee -a "${SERVICE_FILE}"
        echo "LimitNPROC=100000" | sudo tee -a "${SERVICE_FILE}"
    fi
else
    echo "ERROR: Could not find systemd configuration file for mongod"
    exit 1
fi

# We changed a systemd file. Need to reload it.
sudo systemctl daemon-reload
