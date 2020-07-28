#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# A collection of shell functions for using the EC2 Metadata Service Version 2 to fetch information about the EC2 instance
# that a script is running on.
# Note that using some of the functions in this script require that the system already has the following applications
# installed:
#   * grep
#   * tr
#   * curl
#   * awk

function get_metadata_token() {
    curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 30" 2> /dev/null
}

function get_identity_document() {
    # Usage: $0 <token>
    TOKEN=$1
    curl -s -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/dynamic/instance-identity/document 2> /dev/null
}

function get_instance_id() {
    # Get the ec2 instance id of this instance (ex: i-1234567890)
    # Usage: $0 <token>
    TOKEN=$1
    curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/instance-id 2> /dev/null
}

function get_region() {
    # Get the region that this instance is running within (ex: us-west-2)
    # Usage: $0 <token>
    TOKEN=$1
    IDENTITY_DOC=$(get_identity_document ${TOKEN})
    # The identity doc is a json document, find the 'region' key-value to get the current region.
    # Convert a line like:   "region" : "us-west-2",
    #  into: us-west-2
    echo $IDENTITY_DOC | tr ',' '\n' | tr -d '[",{}]' | grep 'region' | awk '{print $3}'
}