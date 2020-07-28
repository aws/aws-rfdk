#!/bin/env python

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# A simple script to disable authentication on the database. Also ensures that 
# it is only accepting connections via localhost while authentication is disabled.

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
import yaml

def modify_security(mongod_conf):
  # Reference: https://docs.mongodb.com/v3.6/reference/configuration-options/#security-options
  security_conf = mongod_conf.setdefault('security', {})
  security_conf['authorization'] = 'disabled'

def modify_network(mongod_conf):
  # Reference: https://docs.mongodb.com/v3.6/reference/configuration-options/#net-options
  net_conf = mongod_conf.setdefault('net', {})
  net_conf['port'] = 27017
  net_conf['bindIp'] = '127.0.0.1'
  try:
    del net_conf['bindIpAll']
  except KeyError:
    pass
  try:
    del net_conf['ssl']
  except KeyError:
    pass

def main():
  mongod_conf = yaml.load(sys.stdin)
  modify_security(mongod_conf)
  modify_network(mongod_conf)
  print yaml.dump(mongod_conf, default_flow_style=False)

if __name__ == '__main__':
  main()