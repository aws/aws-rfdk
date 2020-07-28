#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Command-line arguments:
#  $1 -- ARN of the Secret containing the admin credentials.

set -xeufo pipefail

if test $# -lt 1
then
  echo "ERROR -- Incorrect number of options for script. See script header for usage."
  exit 1
fi

function cleanup() {
  RC=$?
  # Clean up any secrets
  if test -f ./adminCredentials.js
  then
    rm -f ./adminCredentials.js
  fi
  exit ${RC}
}

trap cleanup EXIT

SCRIPT_DIR=$(dirname $0)
source "${SCRIPT_DIR}/secretsFunction.sh"

ADMIN_CREDENTIALS_ARN=$1

echo 'var adminCredentials = JSON.parse("' > ./temp.js
get_secret_string "${ADMIN_CREDENTIALS_ARN}"
printenv RET_VALUE | sed 's/"/\\"/g' >> ./temp.js
echo '");' >> ./temp.js
cat temp.js | tr -d '\n' > ./adminCredentials.js
rm -f ./temp.js

mongo --port 27017 --host localhost ./createAdminUser.js --quiet