#!/bin/env python

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# A simple script for applying some changes to the /etc/mongod.conf
# We use this script so that we preserve whatever options might already
# exist in the existing mongod.conf file.

# Specifically, this script sets up the go-live configuration:
#  1) Authorization enabled.
#  2) SSL required
#  3) Bind all interfaces

import sys
import yaml

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

def modify_security(mongod_conf):
  # Reference: https://docs.mongodb.com/v3.6/reference/configuration-options/#security-options
  security_conf = mongod_conf.setdefault('security', {})
  security_conf['authorization'] = 'enabled'


def modify_net_options(mongod_conf):
  # Reference: https://docs.mongodb.com/v3.6/reference/configuration-options/#net-options
  net_conf = mongod_conf.setdefault('net', {})

  # Ensure the default port is in-use, or else our security groups
  # will deny access to mongo
  net_conf['port'] = 27017

  # We want mongod binding on all external interfaces
  try:
    del net_conf['bindIp']
  except KeyError:
    pass
  net_conf['bindIpAll'] = True

  # Force SSL/TLS
  ssl_conf = net_conf.setdefault('ssl', {})
  ssl_conf['mode'] = "requireSSL"
  ssl_conf['disabledProtocols'] = "TLS1_0,TLS1_1"
  ssl_conf['allowConnectionsWithoutCertificates'] = True # Clients do not need their own cert to connect
  ssl_conf['allowInvalidCertificates'] = False
  ssl_conf['CAFile'] = '/etc/mongod_certs/ca.crt'
  ssl_conf['PEMKeyFile'] = '/etc/mongod_certs/key.pem'

def main():
  mongod_conf = yaml.load(sys.stdin)
  modify_security(mongod_conf)
  modify_net_options(mongod_conf)
  print yaml.dump(mongod_conf, default_flow_style=False)

if __name__ == '__main__':
  main()