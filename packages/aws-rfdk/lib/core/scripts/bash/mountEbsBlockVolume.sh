#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script that will mount a given EBS volume for use.
# This script will:
#   1) Attach the volume to this instance if it is not already attached.
#   2) Format the block volume to the filesystem format that's passed as an
#      argument to this script. But **ONLY IF** the filesystem has no current format.
#   3) Mount the volume to the given mount point with the given mount options.
#   4) Resize the filesystem on the volume if the volume is larger than the formatted
#      filesystem size.
#
# Note: This does **NOT** support multiple partitions on the EBS Volume. 
#       It's expected that we are using the root parition as the filesystem.
#
# Script arguments:
#  $1 -- EBS Volume Identifier (ex: vol-00000000000)
#  $2 -- Filesystem format.
#  $3 -- Mount path; directory that we mount the EFS to.
#        By default, we automatically search for an available one and use the first we find.
#  $4 -- Mount options for the filesystem; passed to the mount command.
#  $5 -- (optional) The device name to attach the EBS Volume to. If empty/blank, then this
#        script will automatically find an unused device to attach the volume to.

set -xefu

if test $# -lt 4
then
    echo "Usage: $0 <ebs volume id> <filesystem format> <mount path> <mount options> [<device attachment>]"
    echo " <filesystem format> must be one of: xfs  (that is all, for now)"
    exit 1
fi

SCRIPT_LOC=$(dirname $0)

source "${SCRIPT_LOC}/metadataUtilities.sh"

function get_attached_device() {
    # If the given EBS volume is attached, then return the device name it's attached under.
    # Usage:
    #   get_attached_device <EBS volume id>
    # ex:
    #   get_attached_device vol-1234ba726

    EBS_VOL_ID=$1
    METADATA_TOKEN=$(get_metadata_token)
    INSTANCE_ID=$(get_instance_id "${METADATA_TOKEN}")
    AWS_REGION=$(get_region "${METADATA_TOKEN}")

    # Example output:
    #  aws --region us-west-2 ec2 describe-volumes --filters Name=volume-id,Values=vol-0755e90763c1948ad Name=attachment.instance-id,Values=i-0241efb9b8268eff8  --query 'Volumes[].Attachments[].Device'
    # [
    #    "/dev/xvdz"
    # ]
    # If not attached, then the output is:
    # []
    DESCRIBE_OUT=$(aws --region ${AWS_REGION} ec2 describe-volumes \
                    --filters Name=volume-id,Values=${EBS_VOL_ID} Name=attachment.instance-id,Values=${INSTANCE_ID} \
                    --query 'Volumes[].Attachments[].Device' )
    if echo ${DESCRIBE_OUT} | grep 'dev' 2>&1 > /dev/null
    then
        echo $DESCRIBE_OUT | tr -d ']["[:space:]'
    else
        echo ""
    fi
}

function find_available_device_name() {
    # To attach an EBS volume to this instance we need to attach it to a specific device name
    # This function finds an unused device name for us to attach the EBS volume to.
    
    for suffix in $(echo {z..b})
    do
        DEVICE="/dev/xvd${suffix}"
        if ! test -e ${DEVICE}
        then
            echo ${DEVICE}
            return 0
        fi
    done
    return 1
}

function attach_ebs_volume() {
    # Attaches the given EBS Volume to this instance, and waits until it has
    # successfully attached.
    # Usage:
    #  attach_ebs_volume <ebs volume id> <device name of EBS volume>
    # ex:
    #  attach_ebs_volume vol-134fb8343 /dev/xvdz

    EBS_VOL_ID=$1
    TARGET_DEV=$2
    METADATA_TOKEN=$(get_metadata_token)
    INSTANCE_ID=$(get_instance_id "${METADATA_TOKEN}")
    AWS_REGION=$(get_region "${METADATA_TOKEN}")

    # Attach the EBS
    aws --region "${AWS_REGION}" ec2 attach-volume --volume-id "${EBS_VOL_ID}" --instance-id "${INSTANCE_ID}" --device "${TARGET_DEV}"
    # Wait until the volume has attached
    while ! test -e "${TARGET_DEV}"
    do 
        sleep 1
    done
}

function is_partition_table() {
    # Determine whether or not the given device is a partition table.
    # Usage:
    #  is_paritition_table <device name>
    #  <device name> must be a regular file (no symlinks!)
    # ex:
    #  is_paritition_table /dev/nvme1n1

    # Use blkid to determine whether it's a partition table. If it is, then there will be a PTUUID in the blkid output.
    # ex:
    # $ blkid -o full /dev/nvme0n1
    # /dev/nvme0n1: PTUUID="24f84068-53be-4ae2-a53d-cbac5515b1af" PTTYPE="gpt"

    DEVICE_NAME=$1

    sudo blkid -o full "${DEVICE_NAME}" | grep 'PTUUID=' > /dev/null
}

function identify_volume() {
    # Determine the UUID of the filesystem on the given device.
    # Requires: The device has a filesystem.
    # Usage:
    #  identify_filesystem <device name>
    #  <device name> must be a regular file (no symlinks!)
    # ex:
    #  identify_filesystem /dev/nvme0n1

    # Example 'blkid -o export' output:
    # DEVNAME=/dev/nvme1n1
    # UUID=a7786831-dd21-40b5-abc5-0c9a9f7929a4
    # TYPE=xfs

    DEVICE_NAME=$1

    sudo blkid -o export ${DEVICE_NAME} | grep '^UUID=' | cut -s -d '=' -f 2
}

function identify_filesystem() {
    # Determine what type of filesystem, if any, is present on the given device.
    # Usage:
    #  identify_filesystem <device name>
    #  <device name> must be a regular file (no symlinks!)
    # ex:
    #  identify_filesystem /dev/nvme0n1

    # Example 'blkid -o export' output:
    # DEVNAME=/dev/nvme1n1
    # UUID=a7786831-dd21-40b5-abc5-0c9a9f7929a4
    # TYPE=xfs

    # Some TYPE fields:
    # TYPE=xfs
    # TYPE=ext2
    # TYPE=ext3
    # TYPE=ext4
    # TYPE=vfat

    DEVICE_NAME=$1

    if BLKID_OUT=$( sudo blkid -o export ${DEVICE_NAME} | grep '^TYPE=' )
    then
        echo ${BLKID_OUT} | cut -s -d '=' -f 2
    else
        echo "UNFORMATTED"
    fi
}

function format_volume() {
    # When first attached the EBS volume will not have a filesystem on it
    # This function is intended to be used to format such a blank volume.
    # It *can* also be used to wipe a device and give it a new format, as well,
    # so *be careful*.
    #
    # Usage:
    #  format_volume <device name> <format type>
    #  <device name> must be a regular file (no symlinks!)
    #  <format type> must be a valid value for the -t option of mkfs
    # ex:
    #  format_volume /dev/nvme0n1

    DEVICE_NAME=$1
    FORMAT=$2

    RESERVE_BLOCK_OPTION=""
    if test "${FORMAT:0:3}" == "ext"
    then
        # The -m option for ext filesystems:
        #  Specify the percentage of the filesystem blocks reserved for the super-user. Default is 5%.
        # Set this to 0%. This volume will not be a root volume.
        RESERVE_BLOCK_OPTION="-m 0"
    fi
    sudo mkfs -t "${FORMAT}" ${RESERVE_BLOCK_OPTION} "${DEVICE_NAME}"
    # Be paranoid. Make sure the drive formatted
    if ! test "$(identify_filesystem ${DEVICE_NAME})" == "${FORMAT}"
    then
        echo "ERROR: Device ${DEVICE_NAME} failed to format"
        exit 1
    fi
}

function mount_volume() {
    # Mount the given device to a specified mount point, and set up /etc/fstab so that it is
    # remounted on reboot.
    # Usage:
    #  mount_volume <device name> <mount point> [<extra mount options>]
    #  <device name> must be a regular file (no symlinks!)
    #  <mount point> will be created if it does not already exist.
    # ex:
    #  mount_volume /dev/nvme0n1 /var/lib/mongo ro

    DEVICE_NAME=$1
    MOUNT_POINT=$2
    EXTRA_MOUNT_OPTIONS=${3:-rw}
    test -d "${MOUNT_POINT}" || sudo mkdir -p "${MOUNT_POINT}"

    VOL_UUID=$(identify_volume ${DEVICE_NAME})
    VOL_TYPE=$(identify_filesystem ${DEVICE_NAME})

    # fstab may be missing a newline at end of file.
    if test $(tail -c 1 /etc/fstab | wc -l) -eq 0
    then
        # Newline was missing, so add one.
        echo "" | sudo tee -a /etc/fstab
    fi

    echo "UUID=${VOL_UUID} ${MOUNT_POINT} ${VOL_TYPE} defaults,nofail,${EXTRA_MOUNT_OPTIONS} 0 2" | sudo tee -a /etc/fstab
    sudo mount "${MOUNT_POINT}"
}

function resize_volume_partition_if_needed() {
    # If the EBS volume is larger than the formatted disk space, then we need
    # to resize the filesystem to grow to the EBS volume size.
    # Usage:
    #  $0 <device name>
    #  <device name> must be a regular file (no symlinks!)
    # ex:
    #  resize_volume_partition_if_needed /dev/nvme1n1

    # Reference: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/recognize-expanded-volume-linux.html

    DEVICE_NAME=$1

    FS_TYPE=$(identify_filesystem ${DEVICE_NAME})
    case "${FS_TYPE}" in
    xfs)
        # xfs_growfs handles checking whether a resize needs to happen or not automatically.
        # ex:
        # meta-data=/dev/nvme1n1           isize=512    agcount=5, agsize=655360 blks
        #          =                       sectsz=512   attr=2, projid32bit=1
        #          =                       crc=1        finobt=1 spinodes=0
        # data     =                       bsize=4096   blocks=2883584, imaxpct=25
        #          =                       sunit=0      swidth=0 blks
        # naming   =version 2              bsize=4096   ascii-ci=0 ftype=1
        # log      =internal               bsize=4096   blocks=2560, version=2
        #          =                       sectsz=512   sunit=0 blks, lazy-count=1
        # realtime =none                   extsz=4096   blocks=0, rtextents=0
        # data size unchanged, skipping
        sudo xfs_growfs -d "${DEVICE_NAME}"
        ;;
    ext*)
        # resize2fs handles checking whether a resize needs to happen or not automatically
        # ex:
        #  resize2fs 1.42.9 (28-Dec-2013)
        #  The filesystem is already 2621440 blocks long.  Nothing to do!
        sudo resize2fs ${DEVICE_NAME}
        ;;
    *)
        echo "ERROR -- Cannot resize unknown filesystem type '${FS_TYPE}'"
        exit 1
    esac
}

VOL_ID=$1
if ! echo $VOL_ID | grep -E 'vol-[A-Fa-f0-9]+' 2>&1 > /dev/null
then
    echo "ERROR: $VOL_ID does not look like an the id for an EBS volume"
    exit 1
fi

FILESYSTEM_FORMAT=$2
MOUNT_PATH=$3
MOUNT_OPTIONS=$4
GIVEN_TARGET_DEVICE=${5:-}

# If the EBS volume is already attached, then get the device 
# name it's attached as.
TARGET_DEVICE=$(get_attached_device ${VOL_ID})

# If not set, fall back to $GIVEN_TARGET_DEVICE or finding a device if that's not set either.
if test "${TARGET_DEVICE}" == ""
then
    TARGET_DEVICE=${TARGET_DEVICE:-${GIVEN_TARGET_DEVICE:-$(find_available_device_name)}}
    attach_ebs_volume $VOL_ID $TARGET_DEVICE
fi

if ! test -e "${TARGET_DEVICE}"
then
    echo "ERROR -- Could not find device ${TARGET_DEVICE}"
    exit 1
fi

# Look through symlinks to the true device file.
DEVICE_NAME=$(readlink -f "${TARGET_DEVICE}")

is_partition_table "${DEVICE_NAME}" && echo "ERROR -- '${DEVICE_NAME}' is a partition table." && exit 1

if test "$(identify_filesystem ${DEVICE_NAME})" == "UNFORMATTED"
then
    format_volume "${DEVICE_NAME}" "${FILESYSTEM_FORMAT}"
fi

mount_volume "${DEVICE_NAME}" "${MOUNT_PATH}" "${MOUNT_OPTIONS}"

resize_volume_partition_if_needed $DEVICE_NAME
