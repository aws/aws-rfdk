#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script configures any settings in the deadline.ini file for the rcs then restarts it to ensure they take effect.
#
# Arguments:
# $@ Alternating pairs of Deadline ini file setting names and values.

set -euxo pipefail

args=("$@")

# Function to check if the RCS is running and listening
function is-rcs-ready() {
    local rcs_pids="$(pgrep deadlinercs)"

    if [ -z "$rcs_pids" ]; then
        echo "RCS is not running"
        return 1
    fi

    # Replace newlines with commas as expected by the -p argument of lsof
    rcs_pids=$(echo "$rcs_pids" | paste -s -d ,)

    # Check if the RCS process has any TCP listening sockets
    lsof -iTCP -sTCP:LISTEN -p "$rcs_pids" > /dev/null
}

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

sudo -u ec2-user "$deadlinecommand" -SetIniFileSetting LaunchRemoteConnectionServerAtStartup True

for (( i=0; i<${#args[@]}; i=i+2 ))
  do
    sudo -u ec2-user "$deadlinecommand" -SetIniFileSetting "${args[i]}" "${args[i+1]}"
  done

# Configure the Launcher to start the RCS and restart it
/etc/init.d/deadline10launcher restart

# Wait until the RCS is up and running
echo "Waiting for RCS to be ready"
while ! is-rcs-ready; do
    sleep 1
done
echo "RCS is ready"
