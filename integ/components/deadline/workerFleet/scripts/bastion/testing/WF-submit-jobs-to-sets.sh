#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to submit test Deadline jobs to be picked up by worker nodes based on their assigned group, pool, or region
#
# Input:
#   JOB_NAME: Name for the test config/job submitted to Deadline. Will be either "group", "pool", or "region"
#   ARG: Command line arg added to `deadlinecommand` to submit the job to only the specific group/pool/region for the test case
# Output:
#   Output of job `deadlinecommand GetJobDetails` for the submitted job

set -euo pipefail

JOB_NAME=$1
ARG=$2
DEADLINE="/opt/Thinkbox/Deadline10/bin"

# Send a sleep command to the render queue; based on the arg passed in, this job will be assigned to the test group, region, or pool
JOB_ID=$($DEADLINE/deadlinecommand SubmitCommandLineJob -executable "/usr/bin/sleep" -arguments "10" -frames "1-10" -name $JOB_NAME)
# We then pull the jobId from the output of `SubmitCommandLineJob`
JOB_ID=$(sed s/JobID=//g <<< $(grep -o "JobID=\w*" <<< $JOB_ID))

# Rest to allow time for the worker to pull the job from the render queue
sleep 7s

# List workers for each job
ASSIGNED_WORKERS=$($DEADLINE/deadlinecommand GetSlavesRenderingJob $JOB_ID)

# Occasionally the above request is made while the worker is between frames, so if the previous
# operation returns a blank string, this loop will retry every second up to five times
RETRY_COUNT=0
while [ "$ASSIGNED_WORKERS" = "" ]; do
  sleep 1s
  ASSIGNED_WORKERS=$($DEADLINE/deadlinecommand GetSlavesRenderingJob $JOB_ID)
  RETRY_COUNT=$(( $RETRY_COUNT + 1 ))
  if [[ $RETRY_COUNT -eq 5 ]]; then
    exit 1
  fi
done

# Count the number of workers reported to be assigned to the job
WORKER_COUNT=0
for WORKER in $ASSIGNED_WORKERS; do
  WORKER_COUNT=$(( $WORKER_COUNT + 1 ))
done

echo $WORKER_COUNT

# Delete the job when finished
$DEADLINE/deadlinecommand DeleteJob $JOB_ID >/dev/null

exit 0
