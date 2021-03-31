#!/bin/sh

# Script to install and configure cachefilesd onto a Linux host.
# This script is presently narrowly written for use on the ECS container host
# instance(s) that are running the Deadline RCS containers in the RenderQueue construct.

set -xeu

if ! test -f /sbin/cachefilesd
then
  # The yum install can fail if there is no route to the yum repository.
  # Since this is an AL2 instance, that is equivalent to requiring a route to
  # the regional S3 endpoint on port 80.
  sudo yum install -y cachefilesd || ( echo 'ERROR -- Failed to install cachefilesd' && exit 0 )

  cat << EOF | sudo tee -a /etc/cachefilesd.conf
# Allow 16k cull table entries
culltable 14
EOF

fi

# Make sure cachefilesd is running
sudo systemctl enable cachefilesd
sudo systemctl start cachefilesd
