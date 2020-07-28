/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  implementsIConnectionOptions,
  implementsIMongoDbConfigureResource,
  implementsIX509AuthenticatedUser,
} from '../types';

test.each([
  [ // Success case
    {
      Hostname: 'foo.bar',
      Port: '1234',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    true,
  ],
  [ // Missing hostname
    {
      Port: '1234',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Missing port
    {
      Hostname: 'foo.bar',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Missing credentials
    {
      Hostname: 'foo.bar',
      Port: '1234',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Missing CA
    {
      Hostname: 'foo.bar',
      Port: '1234',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
    },
    false,
  ],
  [ // Bad port - NaN
    {
      Hostname: 'foo.bar',
      Port: 'foo',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Bad port - too small
    {
      Hostname: 'foo.bar',
      Port: '0',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Bad port - too big
    {
      Hostname: 'foo.bar',
      Port: '100000',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Bad credentials
    {
      Hostname: 'foo.bar',
      Port: '1234',
      Credentials: 'not a secret',
      CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
    },
    false,
  ],
  [ // Bad CA
    {
      Hostname: 'foo.bar',
      Port: 'foo',
      Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      CaCertificate: 'not a secret',
    },
    false,
  ],
  [ // Not an object.
    'not an object',
    false,
  ],
  [ // undefined
    undefined,
    false,
  ],
])('implementsIConnectionOptions: %p returns %p', (value: any, expected: boolean) => {
  expect(implementsIConnectionOptions(value)).toStrictEqual(expected);
});

const goodRoles = JSON.stringify([
  { role: 'readWrite', db: 'testdb' },
]);

test.each([
  [ // simple success
    {
      Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      Roles: goodRoles,
    },
    true,
  ],
  [ // fail -- missing username
    {
      Roles: goodRoles,
    },
    false,
  ],
  [ // fail -- missing roles
    {
      Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
    },
    false,
  ],
  [ // fail -- parse error on Roles.
    {
      Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
      Roles: '}{',
    },
    false,
  ],
])('implementsIX509AuthenticatedUser: %p returns %p', (value: any, expected: boolean) => {
  expect(implementsIX509AuthenticatedUser(value)).toStrictEqual(expected);
});

test.each([
  [ // success -- only connection
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
    },
    true,
  ],
  [ // success -- connection + password auth users.
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      PasswordAuthUsers: [
        'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User1',
        'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User2',
      ],
    },
    true,
  ],
  [ // success -- connection + x509 auth users.
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      X509AuthUsers: [
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
          Roles: goodRoles,
        },
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials2',
          Roles: goodRoles,
        },
      ],
    },
    true,
  ],
  [ // fail -- no connection
    {
    },
    false,
  ],
  [ // fail -- bad connection
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: 'bad port',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
    },
    false,
  ],
  [ // fail -- non-array auth users
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      PasswordAuthUsers: 'not array',
    },
    false,
  ],
  [ // fail -- auth user not a secret #1
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      PasswordAuthUsers: [
        'not a secret',
        'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User2',
      ],
    },
    false,
  ],
  [ // fail -- auth user not a secret #2
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      PasswordAuthUsers: [
        'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/User1',
        'not a secret',
      ],
    },
    false,
  ],
  [ // fail -- non-array x509 auth users
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      X509AuthUsers: 'not array',
    },
    false,
  ],
  [ // fail -- bad x509 auth user #1
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      X509AuthUsers: [
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
          Roles: '}{',
        },
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
          Roles: goodRoles,
        },
      ],
    },
    false,
  ],
  [ // fail -- bad x509 auth user #1
    {
      Connection: {
        Hostname: 'foo.bar',
        Port: '1234',
        Credentials: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
        CaCertificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CA',
      },
      X509AuthUsers: [
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials',
          Roles: goodRoles,
        },
        {
          Certificate: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Credentials2',
          Roles: '}{',
        },
      ],
    },
    false,
  ],
  [ // Not an object.
    'not an object',
    false,
  ],
  [ // undefined
    undefined,
    false,
  ],
])('implementsIMongoDbConfigureResource: %p returns %p', (value: any, expected: boolean) => {
  expect(implementsIMongoDbConfigureResource(value)).toStrictEqual(expected);
});