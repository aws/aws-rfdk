#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Script to pull the names of workers from a render farm and output the pools, groups, and region the workers are assigned to
#
# Input:
#   None
# Output:
#   "testpool testgroup testregion"

set -euo pipefail

DEADLINE="/opt/Thinkbox/Deadline10/bin"

# List workers associated with renderqueue
WORKERS=$($DEADLINE/deadlinecommand GetSlaveNames)
POOL_WORKER=$($DEADLINE/deadlinecommand GetSlaveNamesInPool testpool)
GROUP_WORKER=$($DEADLINE/deadlinecommand GetSlaveNamesInGroup testgroup)

# The list of workers for a region is not easily accessible; this deduces the worker assigned
# to the region by eliminating the two already assigned to the group and pool
for WORKER in $WORKERS; do
  # Converts the worker name to all lower-case; the Windows workers are created with their names in all-caps
  WORKER=$(sed -e 's/\(.*\)/\L\1/' <<< "$WORKER")
  if [ $WORKER != $POOL_WORKER ]; then
    if [ $WORKER != $GROUP_WORKER ]; then
      REGION_WORKER=$WORKER
    fi
  fi
done

$DEADLINE/deadlinecommand GetSlaveSetting $POOL_WORKER Pools
$DEADLINE/deadlinecommand GetSlaveSetting $GROUP_WORKER Groups
$DEADLINE/deadlinecommand GetSlaveInfo $REGION_WORKER Region

exit 0
