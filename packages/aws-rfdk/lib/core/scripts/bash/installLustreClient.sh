#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# This script downloads and installs the Lustre client.
# See https://docs.aws.amazon.com/fsx/latest/LustreGuide/install-lustre-client.html

set -xeu
shopt -s extglob

trap exit_trap EXIT
function exit_trap() {
  if [[ $? -ne 0 ]]; then
    echo "ERROR: An error occurred while attempting to install the Lustre client on your device. \
    Please refer to the FSx for Lustre documentation: https://docs.aws.amazon.com/fsx/latest/LustreGuide/install-lustre-client.html"
  fi
}

function is_kernel_version_lower() {
  local IFS='.-'
  read -r -a lhs_array <<< "$1"
  read -r -a rhs_array <<< "$2"

  # Calculate minimum length betweeen the two arrays
  [[ ${#lhs_array[@]} -lt ${#rhs_array[@]} ]] && n=${#lhs_array[@]} || n=${#rhs_array[@]}

  unset IFS
  for i in $( seq 0 $((n-1)) ); do
    local lhs="${lhs_array[$i]}"
    local rhs="${rhs_array[$i]}"
    if [[ $lhs =~ ^[0-9]+$ && $rhs =~ ^[0-9]+$ && $lhs -lt $rhs ]]; then
      return 0
    fi
  done
  return 1
}

function install_on_al2() {
  architecture=$(uname -m)
  case $architecture in
    x86_64)   min_version="4.14.104-95.84.amzn2.x86_64";;
    aarch64)  min_version="4.14.181-142.260.amzn2.aarch64";;
    *) echo "ERROR: Unrecognized Amazon Linux 2 kernel version: $kernel_version"; exit 1;;
  esac

  kernel_version=$(uname -r)
  if is_kernel_version_lower "$kernel_version" "$min_version"; then
    echo "ERROR: Kernel version ($kernel_version) is lower than the minimum required version: $min_version"
    exit 1
  fi

  sudo amazon-linux-extras install -y lustre2.10
}

function install_on_al1() {
  min_version="4.14.104-78.84.amzn1.x86_64"

  kernel_version=$(uname -r)
  if is_kernel_version_lower "$kernel_version" "$min_version"; then
    echo "ERROR: Kernel version ($kernel_version) is lower than the minimum required version: $min_version"
    exit 1
  fi

  sudo yum install -y lustre-client
}

function install_on_rhel() {
  # Note: In addition to installing the lustre client packages, an additional "kmod-lustre-client" package also needs to be
  # installed. This package contains kernel-specific modules used by the lustre client.

  # Create map of RHEL release to kernel version shell patterns. See https://access.redhat.com/articles/3078
  # This mapping is needed to determine which version of the Lustre client to install based on the instructions at
  # https://docs.aws.amazon.com/fsx/latest/LustreGuide/install-lustre-client.html#lustre-client-rhel
  declare -A rhel_kernel_versions
  rhel_kernel_versions=(
    [7.5]='3.10.0-862.*'
    [7.6]='3.10.0-957.*'
    [7.7]='3.10.0-1062.*'
    [7.8]='3.10.0-1127.*'
    [7.9]='3.10.0-1160.*'
    [8.1]='4.18.0-147.*'
    [8.2]='4.18.0-193.*'
    [8.3]='4.18.0-240.*'
    [8.4]='4.18.0-305.*'
  )

  rhel_version=$(grep ^VERSION_ID= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
  kernel_version=$(uname -r)

  id=$(grep ^ID= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
  if [[ $id = "centos" ]]; then
    # Map CentOS release to the RHEL release it was based on
    # This information can be found by referring to the CentOS release announcements
    # For example, see announcement for CentOS 7 (1804): https://lists.centos.org/pipermail/centos-announce/2018-May/022829.html
    #
    # The major and minor versions of CentOS releases match that of RHEL,
    # so we can just extract those bits and treat them as the RHEL version
    rhel_version=$(awk '{print $4}' /etc/centos-release | awk -F "." '{print $1"."$2}')
  fi

  case $rhel_version in
    # RHEL 7.5 and 7.6
    # ----------------
    7.5|7.6)
      case $kernel_version in
        ${rhel_kernel_versions[7.5]}) lustre_version="2.10.5";;
        ${rhel_kernel_versions[7.6]}) lustre_version="2.10.8";;
        *) echo "ERROR: Unsupported kernel version $kernel_version for RHEL $rhel_version"; exit 1;;
      esac
      sudo yum -y install "https://downloads.whamcloud.com/public/lustre/lustre-${lustre_version}/el7/client/RPMS/x86_64/kmod-lustre-client-${lustre_version}-1.el7.x86_64.rpm"
      sudo yum -y install "https://downloads.whamcloud.com/public/lustre/lustre-${lustre_version}/el7/client/RPMS/x86_64/lustre-client-${lustre_version}-1.el7.x86_64.rpm"
    ;;

    # RHEL 7.7, 7.8, and 7.9
    # ----------------------
    7.7|7.8|7.9)
      architecture=$(uname -m)
      case $architecture in
        x86_64)
          distro_name="el"
          case $kernel_version in
            ${rhel_kernel_versions[7.7]}) replace_ver="7.7";;
            ${rhel_kernel_versions[7.8]}) replace_ver="7.8";;
            ${rhel_kernel_versions[7.9]});; # Do nothing
            *) echo "ERROR: Unsupported kernel version $kernel_version for RHEL $rhel_version"; exit 1;;
          esac
        ;;
        aarch64)
          distro_name="centos"
          case $kernel_version in
            # RHEL 7.8 for ARM-based AWS-Graviton powered instances have the 8.1 kernel version (see AWS docs)
            ${rhel_kernel_versions[8.1]}) replace_ver="7.8";;
            ${rhel_kernel_versions[8.2]});; # Do nothing
            *) echo "ERROR: Unsupported kernel version $kernel_version for RHEL $rhel_version"; exit 1;;
          esac
        ;;
        *) echo "ERROR: Unrecognized architecture: $architecture"; exit 1;;
      esac

      curl https://fsx-lustre-client-repo-public-keys.s3.amazonaws.com/fsx-rpm-public-key.asc -o /tmp/fsx-rpm-public-key.asc
      sudo rpm --import /tmp/fsx-rpm-public-key.asc
      sudo curl "https://fsx-lustre-client-repo.s3.amazonaws.com/${distro_name}/7/fsx-lustre-client.repo" -o /etc/yum.repos.d/aws-fsx.repo
      if [[ -n "${replace_ver+x}" ]]; then
        sudo sed -i "s#7#${replace_ver}#" /etc/yum.repos.d/aws-fsx.repo
      fi

      sudo yum clean all
      sudo yum install -y kmod-lustre-client lustre-client
    ;;

    # RHEL 8.2 or newer
    # -----------------
    8.[2-9]|8.[1-9]+([0-9]))
      case $kernel_version in
        ${rhel_kernel_versions[8.2]}) replace_ver="8.2";;
        ${rhel_kernel_versions[8.3]}) replace_ver="8.3";;
        *)
          if is_kernel_version_lower "$kernel_version" "${rhel_kernel_versions[8.2]}"; then
            echo "ERROR: Kernel version ($kernel_version) is lower than the minimum required version: ${rhel_kernel_versions[8.2]}"
            exit 1
          fi
        ;;
      esac

      curl https://fsx-lustre-client-repo-public-keys.s3.amazonaws.com/fsx-rpm-public-key.asc -o /tmp/fsx-rpm-public-key.asc
      sudo rpm --import /tmp/fsx-rpm-public-key.asc
      sudo curl https://fsx-lustre-client-repo.s3.amazonaws.com/el/8/fsx-lustre-client.repo -o /etc/yum.repos.d/aws-fsx.repo
      if [[ -n "${replace_ver+x}" ]]; then
        # Change the baseurl referenced in aws-fsx.repo to so we pull the correct version of the lustre client for this kernel
        sudo sed -i "s#8#${replace_ver}#" /etc/yum.repos.d/aws-fsx.repo
      fi

      sudo yum clean all
      sudo yum install -y kmod-lustre-client lustre-client
    ;;
    *) echo "ERROR: Unsupported CentOS/RHEL version: $rhel_version"; exit 1;;
  esac
}

function install_on_ubuntu() {
  ubuntu_version=$(grep ^VERSION_ID= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
  kernel_version=$(uname -r)
  architecture=$(uname -m)

  case $ubuntu_version in
    16.04)
      code_name="xenial"
      min_version="4.4.0-1092-aws"
    ;;
    18.04)
      code_name="bionic"
      case $architecture in
        x86_64)   min_version="4.15.0-1054-aws";;
        aarch64)  min_version="5.3.0-1023-aws";;
        *) echo "ERROR: Unrecognized architecture: $architecture"; exit 1;;
      esac
    ;;
    20.04)
      code_name="focal"
      case $architecture in
        x86_64)   min_version="5.4.0-1011-aws";;
        aarch64)  min_version="5.4.0-1015-aws";;
        *) echo "ERROR: Unrecognized architecture: $architecture"; exit 1;;
      esac
    ;;
    *) echo "ERROR: Unsupported Ubuntu version: $ubuntu_version"; exit 1;;
  esac

  wget -O - https://fsx-lustre-client-repo-public-keys.s3.amazonaws.com/fsx-ubuntu-public-key.asc | sudo apt-key add -
  sudo bash -c "echo \"deb https://fsx-lustre-client-repo.s3.amazonaws.com/ubuntu $code_name main\" > /etc/apt/sources.list.d/fsxlustreclientrepo.list && apt-get update"

  if is_kernel_version_lower "$kernel_version" "$min_version"; then
    echo "ERROR: Kernel version ($kernel_version) is lower than the minimum required version: $min_version"
    exit 1
  fi

  sudo apt install -y "lustre-client-modules-${kernel_version}"
}

function install_on_suse() {
  sudo wget https://fsx-lustre-client-repo-public-keys.s3.amazonaws.com/fsx-sles-public-key.asc
  sudo rpm --import fsx-sles-public-key.asc
  sudo wget https://fsx-lustre-client-repo.s3.amazonaws.com/suse/sles-12/SLES-12/fsx-lustre-client.repo

  sudo zypper -n ar --gpgcheck-strict fsx-lustre-client.repo
  
  suse_version=$(grep ^VERSION_ID= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
  case $suse_version in
    12.3) sudo sed -i 's#SLES-12#SP3#' /etc/zypp/repos.d/aws-fsx.repo;;
    12.4) sudo sed -i 's#SLES-12#SP4#' /etc/zypp/repos.d/aws-fsx.repo;;
    12.5);; # Do nothing
    *)
      echo "ERROR: Unsupported SUSE Linux version: $suse_version"
      exit 1
    ;;
  esac

  sudo zypper -n refresh
  sudo zypper -n install lustre-client
}

if lustre_version=$(lfs --version); then
  echo "Lustre client already installed: $lustre_version"
  exit 0
fi

echo "Installing Lustre client..."

os_id=$(grep ^ID= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
case $os_id in
  rhel|centos)   install_on_rhel;;
  ubuntu) install_on_ubuntu;;
  sles)   install_on_suse;;
  amzn)
    amzn_version=$(uname -r | awk -F "." '{print $5}')
    case $amzn_version in
      amzn1)        install_on_al1;;
      amzn2?(int))  install_on_al2;;
      *)
        echo "WARNING: Unrecognized Amazon Linux version: $amzn_version. Assuming Amazon Linux 2..."
        install_on_al2
      ;;
    esac
  ;;
  *)
    pretty_name=$(grep ^PRETTY_NAME= /etc/os-release | awk -F "=" '{print $2}' | sed s/\"//g)
    echo "ERROR: Unsupported operating system: $os_id ($pretty_name)"
    exit 1
  ;;
esac
