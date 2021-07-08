#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script will mount an Amazon FSx for Lustre File System to a specified mount directory on this instance,
# and set up /etc/fstab so that the file system is re-mounted on a system reboot.
#
# This script requires the Lustre client to be already installed on the instance.
# See https://docs.aws.amazon.com/fsx/latest/LustreGuide/install-lustre-client.html
#
# Note: This script uses get_metadata_token and get_region from ./metadataUtilities.sh
#  Thus, the system must have applications pre-installed as outlined in that file.
#
# Script arguments:
#  $1 -- file system Identifier (ex: fs-00000000000)
#  $2 -- Mount path; directory that we mount the file system to.
#  $3 -- Mount name
#  $4 -- (optional) NFSv4 mount options for the file system.

set -xeu

if test $# -lt 3
then
  echo "Usage: $0 <file system ID> <mount path> <mount name> [<mount options>]"
  exit 1
fi

SCRIPT_DIR=$(dirname $0)
source "${SCRIPT_DIR}/metadataUtilities.sh"

# Make sure that the EC2 instance identity document is authentic before we use it to fetch
# information about the instance we're running on.
authenticate_identity_document

METADATA_TOKEN=$(get_metadata_token)
AWS_REGION=$(get_region "${METADATA_TOKEN}")

FILESYSTEM_ID=$1
MOUNT_PATH=$2
MOUNT_NAME=$3
MOUNT_OPTIONS="${4:-}"

FILESYSTEM_DNS_NAME="${FILESYSTEM_ID}.fsx.${AWS_REGION}.amazonaws.com"
MOUNT_OPTIONS="defaults,noatime,flock,_netdev,${MOUNT_OPTIONS}"

sudo mkdir -p "${MOUNT_PATH}"

# Attempt to mount the FSx file system

# fstab may be missing a newline at end of file.
if test $(tail -c 1 /etc/fstab | wc -l) -eq 0
then
  # Newline was missing, so add one.
  echo "" | sudo tee -a /etc/fstab
fi

# See https://docs.aws.amazon.com/fsx/latest/LustreGuide/mount-fs-auto-mount-onreboot.html
MOUNT_TYPE=lustre
echo "${FILESYSTEM_DNS_NAME}@tcp:/${MOUNT_NAME} ${MOUNT_PATH} ${MOUNT_TYPE} ${MOUNT_OPTIONS} 0 0" | sudo tee -a /etc/fstab

# We can sometimes fail to mount the file system with a "Connection reset by host" error, or similar. 
# To counteract this, as best we can, we try to mount the file system a handful of times and fail-out
# only if unable to mount it after that.
TRIES=0
MAX_TRIES=20
while test ${TRIES} -lt ${MAX_TRIES} && ! sudo mount -a -t ${MOUNT_TYPE}
do
  let TRIES=TRIES+1
  sleep 2
done

# Check whether the drive as been mounted. Fail if not.
cat /proc/mounts | grep "${MOUNT_PATH}"
exit $?
