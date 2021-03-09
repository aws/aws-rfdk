#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script downloads, installs and configures the cloudwatch agent. Must be run as sudo capable user.

usage() {
  echo "This script downloads, installs and configures the CloudWatch agent. Must be run as sudo capable user.
Arguments:
  -i: [Flag] Attempts to install the CloudWatch agent. If this isn't set we skip right to configuring it.
  -s: [Flag] Skips the verification of the CloudWatch agent installer. Only relevent if we are trying to install the agent.
  \$1: region
  \$2: SSM parameter name

Note: Flags must appear before positional parameters"
  exit 1
}

# Don't exit if commands fail
set -x

function install_agent {
  region="$1"
  # Check if amazon-cloudwatch-agent is already installed
  if rpm -qa | grep amazon-cloudwatch-agent
  then
    return
  fi

  TMPDIR=$(mktemp -d)
  pushd $TMPDIR 2>&1 > /dev/null

  # Download CloudWatch agent installer
  aws s3api get-object --region $region --bucket amazoncloudwatch-agent-$region --key amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm amazon-cloudwatch-agent.rpm

  if [ "$SKIP_VERIFICATION" = false ]
  then
    aws s3api get-object --region $region --bucket amazoncloudwatch-agent-$region --key assets/amazon-cloudwatch-agent.gpg amazon-cloudwatch-agent.gpg
    GPG_IMPORT_OUT=$(gpg --no-default-keyring --keyring ./keyring.gpg --import amazon-cloudwatch-agent.gpg 2>&1)
    GPG_KEY=$(echo "${GPG_IMPORT_OUT}" | grep -Eow 'key [0-9A-F]+' | awk '{print $2}')
    GPG_FINGERPRINT_OUT=$(gpg --no-default-keyring --keyring ./keyring.gpg --fingerprint ${GPG_KEY} 2>&1)
    GPG_FINGERPRINT=$(echo "${GPG_FINGERPRINT_OUT}" | tr -d '[:blank:]' | grep -Eo 'fingerprint=[0-9A-F]{40}')
    if test "${GPG_FINGERPRINT}" != "fingerprint=937616F3450B7D806CBD9725D58167303B789C72"
    then
        # Key failed to verify. Alert AWS!!
        echo "ERROR: Key failed to verify."
        popd
        rm -rf ${TMPDIR}
        return
    fi

    aws s3api get-object --region $region --bucket amazoncloudwatch-agent-$region --key amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm.sig amazon-cloudwatch-agent.rpm.sig
    if ! gpg --no-default-keyring --keyring ./keyring.gpg --verify amazon-cloudwatch-agent.rpm.sig amazon-cloudwatch-agent.rpm 2>&1
    then
        # CloudWatch agent installer failed to verify. Alert AWS!!
        echo "ERROR: Agent installer failed to verify"
        popd
        rm -rf ${TMPDIR}
        return
    fi
  fi

  # Run the CloudWatch agent installer
  sudo rpm -U ./amazon-cloudwatch-agent.rpm

  popd
  rm -rf ${TMPDIR}
}

echo "Starting CloudWatch installation and configuration script."

# Parse options
SKIP_VERIFICATION=false
INSTALL_AGENT=false
OPTIND=1 # Reset index for getopts in case of previous invocations
while getopts "is" opt; do
  case $opt in
  i) INSTALL_AGENT=true ;;
  s) SKIP_VERIFICATION=true ;;
  \?) echo "ERROR: Unknown option specified"; usage ;;
  esac
done
shift $((OPTIND - 1))

# Parse positional arguments
if (($# != 2))
then
  echo "ERROR: Invalid arguments"
  usage
fi
REGION="$1"
SSM_PARAMETER_NAME="$2"

# Check if we want to attempt to install the agent
if $INSTALL_AGENT
then
  install_agent $REGION
else
  echo "Skipped installation of CloudWatch agent"
fi

# starts the agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a append-config -m ec2 -c ssm:$SSM_PARAMETER_NAME -s

echo "Script completed successfully."
