#!/bin/env python

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# A simple script for setting the storage location of the MongoDB in /etc/mongod.conf
# We use this script so that we preserve whatever options might already exist in the
# existing mongod.conf file.

# For reference, the default mongod.conf is:
"""
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

# Where and how to store data.
storage:
  dbPath: /var/lib/mongo
  journal:
    enabled: true
#  engine:
#  mmapv1:
#  wiredTiger:

# how the process runs
processManagement:
  fork: true  # fork and run in background
  pidFilePath: /var/run/mongodb/mongod.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo

# network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1  # Listen to local interface only, comment to listen on all interfaces.


#security:

#operationProfiling:

#replication:

#sharding:

## Enterprise-Only Options

#auditLog:

#snmp:
"""

import sys
import os
import yaml


def modify_storage_path(mongod_conf, storage_path):
    # Should never happen that this isn't set, but play it safe. Set to out-of-the-box default.
    storage_conf = mongod_conf.setdefault('storage', {
        'journal': {'enabled': 'true'}
    })
    storage_conf['dbPath'] = storage_path


def main():
    if len(sys.argv) < 2:
        raise Exception("ERROR -- Require the storage path as an argument.")
    storage_path = sys.argv[1]
    if not os.path.isdir(storage_path):
        raise Exception("ERROR -- {storage_path} is not a directory.".format(storage_path=storage_path))

    mongod_conf = yaml.safe_load(sys.stdin)
    modify_storage_path(mongod_conf, storage_path)
    print(yaml.dump(mongod_conf, default_flow_style=False))


if __name__ == '__main__':
    main()
