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

function authenticate_identity_document() {
    # Cryptographically verify that the instance identity document is authentic by
    # using the instructions here: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/verify-pkcs7.html
    
    if ! which openssl > /dev/null 2>&1
    then
        if ! sudo yum install -y openssl || sudo apt-get install -y openssl
        then
            echo "ERROR -- Authenticating the instance identity document requires openssl"
            return 1
        fi
    fi

    SCRIPT_DIRECTORY=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
    TOKEN=$(get_metadata_token)

    CERT_FILE=$(mktemp)
    echo "-----BEGIN PKCS7-----" > "${CERT_FILE}"
    curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/dynamic/instance-identity/pkcs7 2> /dev/null >> "${CERT_FILE}"
    echo "" >> "${CERT_FILE}"
    echo "-----END PKCS7-----" >> "${CERT_FILE}"

    DOCUMENT_FILE=$(mktemp)
    curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/dynamic/instance-identity/document 2> /dev/null > "${DOCUMENT_FILE}"

    echo "Verifying identity document authenticity"
    openssl smime -verify -in "${CERT_FILE}" -inform PEM -content "${DOCUMENT_FILE}" -certfile ${SCRIPT_DIRECTORY}/ec2-certificates.crt -noverify 1> /dev/null
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

function get_availability_zone() {
    # Get the availability zone that this instance is running within (ex: us-west-2b)
    # Usage: $0 <token>
    TOKEN=$1
    curl -H "X-aws-ec2-metadata-token: $TOKEN" -v 'http://169.254.169.254/latest/meta-data/placement/availability-zone' 2> /dev/null
}
