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
#  $3 -- whether to obtain the EFS mount target's IP address using the EFS API and persist this to
#        the /etc/hosts file on the system. This allows the script to work when the mounting instance cannot resolve the
#        mount target using DNS. A value of "true" (case sensitive) will  enable this feature. Any other value will
#        is treated as being disabled.
#  $4 -- (optional) NFSv4 mount options for the EFS. 

set -xeu

if test $# -lt 2
then
  echo "Usage: $0 FILE_SYSTEM_ID MOUNT_PATH RESOLVE_MOUNT_POINT_USING_API [MOUNT_OPTIONS]"
  exit 1
fi

SCRIPT_DIR=$(dirname $0)
source "${SCRIPT_DIR}/metadataUtilities.sh"

# Make sure that the EC2 instance identity document is authentic before we use it to fetch
# information about the instance we're running on.
authenticate_identity_document

METADATA_TOKEN=$(get_metadata_token)
AWS_REGION=$(get_region "${METADATA_TOKEN}")
AVAILABILITY_ZONE_NAME=$(get_availability_zone "${METADATA_TOKEN}")

FILESYSTEM_ID=$1
MOUNT_PATH=$2
RESOLVE_MOUNTPOINT_IP_VIA_API=$3
MOUNT_OPTIONS="${4:-}"

mkdir -p "${MOUNT_PATH}"

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
  test -f "/sbin/mount.efs" || "${PACKAGE_MANAGER}" install -y "${AMAZON_EFS_PACKAGE}"
  return $?
}

function use_nfs_mount() {
  test -f "/sbin/mount.nfs4" || "${PACKAGE_MANAGER}" install -y "${NFS_UTILS_PACKAGE}"
  return $?
}

function resolve_mount_target_ip_via_api() {
  local EFS_FS_ID=$1
  local MNT_TARGET_RESOURCE_ID=$2
  local AVAILABILITY_ZONE_NAME=$3
  local AWS_REGION=$4
  local MOUNT_POINT_IP=""

  local FILTER_ARGUMENT=""
  if [[ $MNT_TARGET_RESOURCE_ID == fs-* ]]
  then
    # Mounting without an access point
    FILTER_ARGUMENT="--file-system-id ${MNT_TARGET_RESOURCE_ID}"
  elif [[ $MNT_TARGET_RESOURCE_ID == fsap-* ]]
  then
    # Mounting with an access point
    FILTER_ARGUMENT="--access-point-id ${MNT_TARGET_RESOURCE_ID}"
  else
    echo "Unsupported mount target resource: ${MNT_TARGET_RESOURCE_ID}"
    return 1
  fi

  # We prioritize the mount target in the same availability zone as the mounting instance
  # jq sorts with false first then true (https://stedolan.github.io/jq/manual/#sort,sort_by(path_expression), so we
  # negate the condition in the sort_by(...) expression
  MOUNT_POINT_JSON=$(aws efs describe-mount-targets \
    --region "${AWS_REGION}"                      \
    ${FILTER_ARGUMENT}                            \
    | jq ".MountTargets | sort_by( .AvailabilityZoneName != \"${AVAILABILITY_ZONE_NAME}\" ) | .[0]"
  )

  if [[ -z "${MOUNT_POINT_JSON}" ]]
  then
    echo "Could not find mount target for ${MNT_TARGET_RESOURCE_ID}"
    return 1
  fi

  MOUNT_POINT_IP=$(echo "${MOUNT_POINT_JSON}" | jq -r .IpAddress)
  MOUNT_POINT_AZ=$(echo "${MOUNT_POINT_JSON}" | jq -r .AvailabilityZoneName )

  if [[ "${MOUNT_POINT_AZ}" != "${AVAILABILITY_ZONE_NAME}" ]]
  then
    set +x
    echo "------------------------------------------ WARNING ------------------------------------------"
    echo "Could not find mount target for ${MNT_TARGET_RESOURCE_ID} matching the current availability"
    echo "zone (${AVAILABILITY_ZONE_NAME}). Cross-AZ data charges will be applied. To reduce costs,"
    echo "add a mount target for ${MNT_TARGET_RESOURCE_ID} in ${AVAILABILITY_ZONE_NAME}."
    echo "------------------------------------------ WARNING ------------------------------------------"
    set -x
  fi

  DNS_NAME="${EFS_FS_ID}.efs.${AWS_REGION}.amazonaws.com"

  # Backup the old hosts file
  cp /etc/hosts "/etc/hosts.rfdk-backup-$(date +%Y-%m-%dT%H:%M:%S)"
  # Remove any existing entries for the target DNS name
  sed -i -e "/${DNS_NAME}/d" /etc/hosts
  # Write the resolved entry for the target DNS name
  cat >> /etc/hosts <<EOF

${MOUNT_POINT_IP} ${DNS_NAME} # Added by RFDK
EOF
}

# Optionally resolve DNS using the EFS API
if [[ $RESOLVE_MOUNTPOINT_IP_VIA_API == "true"  ]]
then
  # jq is used to query the JSON API response
  if ! where jq > /dev/null 2>&1
  then
    "${PACKAGE_MANAGER}" install -y jq
  fi

  # Get access point ID if available, otherwise file system ID
  MNT_TARGET_RESOURCE_ID=$FILESYSTEM_ID
  # The access point is supplied as in the MOUNT_OPTIONS argument, which is a list of comma-separated fstab options.
  # Here is a sample opts string containing an access point:
  #
  #   rw,iam,accesspoint=fsap-1234567890,fsc
  #
  # See https://docs.aws.amazon.com/efs/latest/ug/efs-mount-helper.html#mounting-access-points
  #
  # We extract that value from MOUNT_OPTIONS here:
  ACCESS_POINT_MOUNT_OPT=$(echo "${MOUNT_OPTIONS}" | sed -e 's#,#\n#g' | grep 'accesspoint=') || true
  if [[ ! -z "${ACCESS_POINT_MOUNT_OPT}" ]]; then
    ACCESS_POINT_ID=$(echo "${ACCESS_POINT_MOUNT_OPT}" | cut -d= -f2)
    MNT_TARGET_RESOURCE_ID="${ACCESS_POINT_ID}"
  fi

  # This feature is treated as a best-effort first choice but falls-back to a regular DNS lookup with a warning emitted
  resolve_mount_target_ip_via_api \
      "${FILESYSTEM_ID}"          \
      "${MNT_TARGET_RESOURCE_ID}" \
      "${AVAILABILITY_ZONE_NAME}" \
      "${AWS_REGION}"             \
    || echo "WARNING: Couldn't resolve EFS IP address using the EFS service API endpoint"
fi

# Attempt to mount the EFS file system

# fstab may be missing a newline at end of file.
if test $(tail -c 1 /etc/fstab | wc -l) -eq 0
then
  # Newline was missing, so add one.
  echo "" | tee -a /etc/fstab
fi

if use_amazon_efs_mount
then
  echo "${FILESYSTEM_ID}:/ ${MOUNT_PATH} efs defaults,tls,_netdev,${MOUNT_OPTIONS}" | tee -a /etc/fstab
  MOUNT_TYPE=efs
elif use_nfs_mount
then
  echo "${FILESYSTEM_ID}.efs.${AWS_REGION}.amazonaws.com:/ ${MOUNT_PATH} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev,${MOUNT_OPTIONS} 0 0" | tee -a /etc/fstab
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
while test ${TRIES} -lt ${MAX_TRIES} && ! mount -a -t ${MOUNT_TYPE}
do
  let TRIES=TRIES+1
  sleep 2
done

# Check whether the drive as been mounted. Fail if not.
cat /proc/mounts | grep "${MOUNT_PATH}"
exit $?
