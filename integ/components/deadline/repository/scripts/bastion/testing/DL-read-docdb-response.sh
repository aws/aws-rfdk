#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

export AWS_DEFAULT_REGION=$1
export secretARN=$2
export secretValue=$(aws secretsmanager get-secret-value --secret-id=$secretARN --region=$AWS_DEFAULT_REGION)
export secretString=$(jq -r '.SecretString' <<< "$secretValue")
export mongoPass=$(jq -r '.password' <<< "$secretString")
export mongoEndpoint=$(jq -r '.host' <<< "$secretString")
export mongoPort=$(jq -r '.port' <<< "$secretString")
export mongoAddress=$mongoEndpoint:$mongoPort

mongo --quiet --ssl --host="$mongoAddress" --sslCAFile="./testScripts/rds-combined-ca-bundle.pem" --username="DocDBUser" --password="$mongoPass" --eval='printjson( db.adminCommand( { listDatabases: 1, nameOnly: true, filter: { "name": "deadline10db" } } ) )'
