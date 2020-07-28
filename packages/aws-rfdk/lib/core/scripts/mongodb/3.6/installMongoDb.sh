#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to install MongoDB Community Edition v3.6 from the Mongo.org yum repository.
#
# Developer note: For legal reasons we absolutely cannot distribute MongoDB in any way.
#  This includes distributing the installers, or images with MongoDB pre-installed.
#  We *can* distribute scripting like this that facilitates the installation of 
#  MongoDB from the official MongoDB repository.

set -xefuo pipefail

# Installation instructions: https://docs.mongodb.com/v3.6/tutorial/install-mongodb-on-red-hat/
# Note: There are no instructions for Amazon Linux 2, but the RedHat 7 binaries are compatible.

REPO_FILENAME=mongodb-org-3.6.repo
YUM_REPOS_DIR=/etc/yum.repos.d

cat > "/tmp/${REPO_FILENAME}" << EOF
[mongodb-org-3.6]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/7/mongodb-org/3.6/x86_64
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-3.6.asc
EOF

sudo mv "/tmp/${REPO_FILENAME}" "${YUM_REPOS_DIR}"
# Be paranoid. Make sure the repo file is locked down to root.
sudo chown root.root "${YUM_REPOS_DIR}/${REPO_FILENAME}"
sudo chmod 600 "${YUM_REPOS_DIR}/${REPO_FILENAME}"

# Do the install
sudo yum install -y mongodb-org
