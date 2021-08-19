#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# exit when any command fails
set -xeuo pipefail

USAGE="Usage: $0 <region> <deadline-installers-bucket-name> <deadline-installer-object-key>

This script downloads the deadline client installer and executes it."

if test $# -lt 3
then
    echo "Usage: $0 <region> <deadline-installers-bucket-name> <deadline-installer-object-key>"
    exit 1
fi

REGION=$1
DEADLINE_INSTALLERS_BUCKET_NAME=$2
DEADLINE_INSTALLERS_OBJECT_KEY=$3

CLIENT_INSTALLER=/tmp/deadline_installer.run

aws s3 cp --region $REGION "s3://$DEADLINE_INSTALLERS_BUCKET_NAME/$DEADLINE_INSTALLERS_OBJECT_KEY" $CLIENT_INSTALLER
chmod +x $CLIENT_INSTALLER

$CLIENT_INSTALLER --mode unattended \
                  --connectiontype Remote \
                  --noguimode true \
                  --slavestartup false \
                  --launcherdaemon true \
                  --restartstalled true \
                  --autoupdateoverride false

bash

if [ -z "$DEADLINE_PATH" ]; then
    echo "ERROR: DEADLINE_PATH environment variable not set"
    exit 1
fi

DEADLINE_COMMAND="$DEADLINE_PATH/deadlinecommand"
if [ ! -f "$DEADLINE_COMMAND" ]; then
    echo "ERROR: $DEADLINE_COMMAND not found!"
    exit 1
fi

# keep worker running
"$DEADLINE_COMMAND" -SetIniFileSetting KeepWorkerRunning True
# Disable S3Backed Cache
"$DEADLINE_COMMAND" -SetIniFileSetting UseS3BackedCache False
# Blank the S3BackedCache Url
"$DEADLINE_COMMAND" -SetIniFileSetting S3BackedCacheUrl ""

service deadline10launcher stop
killall -w deadlineworker || true
service deadline10launcher start

echo "Script completed successfully."
