#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script configures the deadline.ini file with the settings for the HealthMonitor
# Arguments:
# $1: healthCheckPort
# $2: minimum supported deadline version

# exit when any command fails
set -xeuo pipefail

HEALTH_CHECK_PORT="$1"
MINIMUM_SUPPORTED_DEADLINE_VERSION=$2

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

DEADLINE_COMMAND="$DEADLINE_PATH/deadlinecommand"
if [ ! -f "$DEADLINE_COMMAND" ]; then
    echo "ERROR: $DEADLINE_COMMAND not found!"
    exit 1
fi

isVersionLessThan() {
    python -c "import sys;sys.exit(0 if tuple(map(int, sys.argv[-2].split('.'))) < tuple(map(int, sys.argv[-1].split('.'))) else 1)" "$1" "$2"
}

DEADLINE_VERSION=$("$DEADLINE_COMMAND" -Version | grep -oP '[v]\K\d+\.\d+\.\d+\.\d+\b')
if [ -z "$DEADLINE_VERSION" ]; then
    echo "ERROR: Unable to identify the version of installed Deadline Client. Exiting..."
    exit 1
fi

if isVersionLessThan $DEADLINE_VERSION $MINIMUM_SUPPORTED_DEADLINE_VERSION; then
    echo "ERROR: Installed Deadline Version ($DEADLINE_VERSION) is less than the minimum supported version ($MINIMUM_SUPPORTED_DEADLINE_VERSION). Exiting..."
    exit 1
fi

# enabling the health check port
"$DEADLINE_COMMAND" -SetIniFileSetting ResourceTrackerVersion V2
# health check port
"$DEADLINE_COMMAND" -SetIniFileSetting LauncherHealthCheckPort $HEALTH_CHECK_PORT

echo "Script completed successfully."
