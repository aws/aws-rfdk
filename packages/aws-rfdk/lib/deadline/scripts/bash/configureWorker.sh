#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script configures the deadline.ini file with the Remote Server endpoints and restart the launcher service
# Arguments:
# $1: healthCheckPort
# $2: comma separated groups
# $3: comma separated pools
# $4: region

# exit when any command fails
set -xeuo pipefail

HEALTH_CHECK_PORT="$1"
WORKER_GROUPS=(${2//,/ })
WORKER_POOLS=(${3//,/ })
WORKER_REGION="$4"

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

# launch worker at launcher startup
"$DEADLINE_COMMAND" -SetIniFileSetting LaunchSlaveAtStartup True
# keep worker running
"$DEADLINE_COMMAND" -SetIniFileSetting KeepWorkerRunning True
# restart stalled worker
"$DEADLINE_COMMAND" -SetIniFileSetting RestartStalledSlave True
# auto update
"$DEADLINE_COMMAND" -SetIniFileSetting AutoUpdateOverride False
# enabling the health check port
"$DEADLINE_COMMAND" -SetIniFileSetting ResourceTrackerVersion V2
# health check port
"$DEADLINE_COMMAND" -SetIniFileSetting LauncherHealthCheckPort $HEALTH_CHECK_PORT
# Disable S3Backed Cache
"$DEADLINE_COMMAND" -SetIniFileSetting UseS3BackedCache False
# Blank the S3BackedCache Url
"$DEADLINE_COMMAND" -SetIniFileSetting S3BackedCacheUrl ""

# setting the group, pool and region for this worker

if [ -z "$WORKER_REGION" ]; then
    echo "INFO: WORKER_REGION not provided"
else
    "$DEADLINE_COMMAND" -SetIniFileSetting Region $WORKER_REGION
fi

WORKER_NAME_PREFIX=`hostname -s`

# Fetching all workers in this node
WORKER_NAMES=()
shopt -s dotglob
for file in /var/lib/Thinkbox/Deadline10/slaves/*
do
  file="${file##*/}"
  workerSuffix="${file%%.*}"
  if [ -z "$workerSuffix" ]; then
    WORKER_NAMES+=( "$WORKER_NAME_PREFIX" )
  else
    WORKER_NAMES+=( "$WORKER_NAME_PREFIX"-$workerSuffix )
  fi
done
shopt -u dotglob

# Setting Groups for all workers in this node
if [ ${#WORKER_GROUPS[@]} -gt 0 ]; then
  for group in "${WORKER_GROUPS[@]}"
  do
    existingGroups=( $("$DEADLINE_COMMAND" -GetGroupNames) )
    if [[ ! " ${existingGroups[@]} " =~ " ${group} " ]]; then
        "$DEADLINE_COMMAND" -AddGroup $group
    fi
  done
  "$DEADLINE_COMMAND" -SetGroupsForSlave $(IFS=, ; echo "${WORKER_NAMES[*]}") $(IFS=, ; echo "${WORKER_GROUPS[*]}")
fi

# Setting Pools for all workers in this node
if [ ${#WORKER_POOLS[@]} -gt 0 ]; then
  for pool in "${WORKER_POOLS[@]}"
  do
    existingPools=( $("$DEADLINE_COMMAND" -GetPoolNames) )
    if [[ ! " ${existingPools[@]} " =~ " ${pool} " ]]; then
        "$DEADLINE_COMMAND" -AddPool $pool
    fi
  done
  "$DEADLINE_COMMAND" -SetPoolsForSlave $(IFS=, ; echo "${WORKER_NAMES[*]}") $(IFS=, ; echo "${WORKER_POOLS[*]}")
fi

# Restart service, if it exists, else restart application
if service --status-all | grep -q 'Deadline 10 Launcher'; then
  service deadline10launcher restart
else
  DEADLINE_LAUNCHER="$DEADLINE_PATH/deadlinelauncher"
  "$DEADLINE_LAUNCHER" -shutdownall
  "$DEADLINE_LAUNCHER"
fi

echo "Script completed successfully."