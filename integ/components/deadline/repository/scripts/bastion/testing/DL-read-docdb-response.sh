#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to query a Deadline repository to confirm the farm's database has been initialized
#
# Input:
#   AWS_REGION: Region where stacks are deployed, taken from AWS.config
#   DB_SECRET_ARN: Id for the Secret containing username/password information for accessing the database
# Output:
#   { "databases" : [ { "name" : "deadline10db" } ], "ok" : 1 } 
set -euo pipefail

AWS_REGION=$1
DB_SECRET_ARN=$2

# Retrieve login information for the database from its Secret
DB_SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id=$DB_SECRET_ARN --region=$AWS_REGION)
DB_SECRET_STRING=$(jq -r '.SecretString' <<< "$DB_SECRET_VALUE")
DB_USERNAME=$(jq -r '.username' <<< "$DB_SECRET_STRING")
DB_PASS=$(jq -r '.password' <<< "$DB_SECRET_STRING")

if [ $(ls cert) ]; then
  # MongoDB instances require retrieving the value of the .pem key created for the database
  CERT_CA="$(pwd)/ca-cert.crt"

  # The domain zone for the mongo instance used is hard-coded during setup
  DB_ADDRESS="mongo.renderfarm.local:27017"
else
  CERT_CA="./testScripts/rds-combined-ca-bundle.pem"

  # DocDB contains the endpoint address to use in its secret
  ENDPOINT=$(jq -r '.host' <<< "$DB_SECRET_STRING")
  PORT=$(jq -r '.port' <<< "$DB_SECRET_STRING")
  DB_ADDRESS=$ENDPOINT:$PORT

fi

# Mongo command to query for "deadline10db" database
mongo --quiet --ssl --host="$DB_ADDRESS" --sslCAFile="$CERT_CA" --username="$DB_USERNAME" --password="$DB_PASS" --eval='printjson( db.adminCommand( { listDatabases: 1, nameOnly: true, filter: { "name": "deadline10db" } } ) )'

# Cleanup
rm -rf "${TMPDIR}"
exit 0