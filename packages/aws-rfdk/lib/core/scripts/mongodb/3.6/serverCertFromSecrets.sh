#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# A script for fetching an X.509 certificate for the server from the Secrets
# that are created by the RFDK's X509CertificatePem

# Command-line arguments
#  $1 -- Certificate secret ARN
#  $2 -- Trust chain secret ARN
#  $3 -- Private key secret ARN
#  $4 -- Private key passphrase secret ARN

set -xeufo pipefail

if test $# -lt 4
then
  echo "ERROR -- Incorrect number of options for script. See script header for usage."
  exit 1
fi

if ! ( which aws && which openssl )
then
  echo "ERROR -- Need the AWS CLI and openssl to be able to run."
  exit 1
fi

SCRIPT_DIR=$(dirname $0)
source "${SCRIPT_DIR}/secretsFunction.sh"

CERT_ID=$1
CHAIN_ID=$2
KEY_ID=$3
KEY_PW_ID=$4

get_secret_string "${CERT_ID}" 
printenv RET_VALUE > ./key.crt
get_secret_string "${CHAIN_ID}" 
printenv RET_VALUE > ./ca.crt
get_secret_string "${KEY_ID}" 
printenv RET_VALUE > ./encrypted_key.pem

# Note: We must get the private key passphrase **LAST**. We use the returned
# environment variable to securely invoke openssl to decrypt the private key.
get_secret_string "${KEY_PW_ID}"

# Decrypt the private key.
openssl rsa -in ./encrypted_key.pem -passin env:RET_VALUE -out ./decrypted_key.pem
unset RET_VALUE

cat key.crt decrypted_key.pem > key.pem

# Validate the certificate and key are valid.
echo "Validating server key"

set +x # Do not print out key modulus; it's a secret
KEY_MODULUS=$(openssl rsa -modulus -noout -in ./decrypted_key.pem | openssl md5)
CA_MODULUS=$(openssl x509 -modulus -noout -in ./key.crt | openssl md5)

test "${KEY_MODULUS}" == "${CA_MODULUS}" || exit 1
set -x

echo "Success - valid key"
