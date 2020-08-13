#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script will mount an Amazon Elastic File System (EFS) to a specified mount directory on this instance,
# and set up /etc/fstab so that the EFS is re-mounted on a system reboot.
#
# Note: This script uses get_metadata_token and get_region from ./metadataUtilities.sh
#  Thus, the system must have applications pre-installed as outlined in that file.
#
# Script arguments:
#  $1 -- EFS Identifier (ex: efs-00000000000)
#  $2 -- Mount path; directory that we mount the EFS to.
#  $3 -- (optional) NFSv4 mount options for the EFS. 

set -xeu

if test $# -lt 2
then
  echo "Usage: $0 <file system ID> <mount path> [<mount options>]"
  exit 1
fi

SCRIPT_DIR=$(dirname $0)
source "${SCRIPT_DIR}/metadataUtilities.sh"

METADATA_TOKEN=$(get_metadata_token)
AWS_REGION=$(get_region "${METADATA_TOKEN}")

FILESYSTEM_ID=$1
MOUNT_PATH=$2
MOUNT_OPTIONS="${3:-}"

sudo mkdir -p "${MOUNT_PATH}"

AMAZON_EFS_PACKAGE="amazon-efs-utils"
if which yum
then
  PACKAGE_MANAGER="yum"
  NFS_UTILS_PACAKGE="nfs-utils"
else
  PACKAGE_MANAGER="apt-get"
  NFS_UTILS_PACKAGE="nfs-common"
fi

function use_amazon_efs_mount() {
  test -f "/sbin/mount.efs" || sudo "${PACKAGE_MANAGER}" install -y "${AMAZON_EFS_PACKAGE}"
  return $?
}

function use_nfs_mount() {
  test -f "/sbin/mount.nfs4" || sudo "${PACKAGE_MANAGER}" install -y "${NFS_UTILS_PACKAGE}"
  return $?
}

# Attempt to mount the EFS file system

# fstab may be missing a newline at end of file.
if test $(tail -c 1 /etc/fstab | wc -l) -eq 0
then
  # Newline was missing, so add one.
  echo "" | sudo tee -a /etc/fstab
fi

if use_amazon_efs_mount
then
  echo "${FILESYSTEM_ID}:/ ${MOUNT_PATH} efs defaults,tls,_netdev,${MOUNT_OPTIONS}" | sudo tee -a /etc/fstab
  MOUNT_TYPE=efs
elif use_nfs_mount
then
  echo "${FILESYSTEM_ID}.efs.${AWS_REGION}.amazonaws.com:/ ${MOUNT_PATH} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev,${MOUNT_OPTIONS} 0 0" | sudo tee -a /etc/fstab
  MOUNT_TYPE=nfs4
else
  echo "Could not find suitable mount helper to mount the Elastic File System: ${FILESYSTEM_ID}"
  exit 1
fi

# We can sometimes fail to mount the EFS with a "Connection reset by host" error, or similar. 
# To counteract this, as best we can, we try to mount the EFS a handful of times and fail-out
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
