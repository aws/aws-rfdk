#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script fetches the Document DB cluster credentials and persists them in
# the local credential store for the current user.
#
# Arguments:
# $1: Path where deadline repository is installed.

set -xeo pipefail +o history

repo_path="$1"

# Cloud-init does not load system environment variables. Cherry-pick the
# environment variable installed by the Deadline Client installer.
if [ -f "/etc/profile.d/deadlineclient.sh" ]; then
    source "/etc/profile.d/deadlineclient.sh"
fi

# Find Deadline
if [ -z "$DEADLINE_PATH" ]; then
    echo "ERROR: DEADLINE_PATH environment variable not set"
    exit 1
fi

# Find Deadline Command
deadlinecommand="$DEADLINE_PATH/deadlinecommand"
if [ ! -f "$deadlinecommand" ]; then
    echo "ERROR: deadlinecommand not found"
    exit 1
fi

# Disable outputting commands so the secret is not exposed
set +x

export DB_CERT_FILE=""
export DB_CERT_PASSWORD=""
# Set the DB credentials. These are scoped to the user that runs the command, so we
configure_deadline_database "$deadlinecommand"

# Resume outputting commands
set -x

# Configure location to Deadline Repository
printenv DB_CERT_PASSWORD | sudo -u ec2-user "$deadlinecommand" -ChangeRepository Direct "$repo_path" "${DB_CERT_FILE}"
unset DB_CERT_FILE
unset DB_CERT_PASSWORD

echo "Script completed successfully"
