/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  implementsIAcmImportCertProps,
  implementsINewSecretProps,
  implementsISecretCertificate,
  implementsIX509CertificateEncodePkcs12,
  implementsIX509CertificateGenerate,
  implementsIX509ResourceProperties,
  implementsTag,
} from '../types';

test.each([
  // Valid
  [
    [{ Key: 'key', Value: 'val' }],
    true,
  ],
  // Valid Multiple
  [
    [
      { Key: 'key1', Value: 'val1' },
      { Key: 'key2', Value: 'val2' },
    ],
    true,
  ],
  // Valid Empty
  [
    [],
    true,
  ],
  // Not array
  [
    'notArray',
    false,
  ],
  // Array doesn't contain objects
  [
    ['notTag'],
    false,
  ],
  // Tag array object missing Key
  [
    [{ Value: 'val' }],
    false,
  ],
  // Tag array object missing value
  [
    [{ Key: 'key' }],
    false,
  ],
])('implementsTag: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsTag(value)).toEqual(doesImplement);
});

test.each([
  // Valid no CertChain
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    true,
  ],
  // Valid with CertChain
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      CertChain: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/CertChain',
    },
    true,
  ],
  // Valid, extra field
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Extra: 'test',
    },
    true,
  ],
  // Value undefined
  [undefined, false],
  // Value not object
  ['test', false],
  // No Cert
  [
    {
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // Cert not arn
  [
    {
      Cert: 'test',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // Cert not string
  [
    {
      Cert: false,
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // No Key
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // Key not arn
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'test',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // Key not string
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: false,
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // No Passphrase
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
    },
    false,
  ],
  // Passphrase not arn
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'test',
    },
    false,
  ],
  // Passphrase not string
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: false,
    },
    false,
  ],
  // CertChain not arn
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      CertChain: 'test',
    },
    false,
  ],
  // CertChain not string
  [
    {
      Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
      Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      CertChain: true,
    },
    false,
  ],
])('implementsISecretCertificate: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsISecretCertificate(value)).toEqual(doesImplement);
});

test.each([
  // Valid
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
    },
    true,
  ],
  // Valid with encryption key
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
      EncryptionKey: 'arn:aws:kms:abc123:1234:key/12ab',
    },
    true,
  ],
  // Value not defined
  [undefined, false],
  // Value not an object
  ['test', false],
  // No description
  [
    {
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
    },
    false,
  ],
  // Description not string
  [
    {
      Description: false,
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
    },
    false,
  ],
  // No NamePrefix
  [
    {
      Description: 'Test Desc',
      Tags: [{ Key: 'key', Value: 'val' }],
    },
    false,
  ],
  // NamePrefix not string
  [
    {
      Description: 'Test Desc',
      NamePrefix: false,
      Tags: [{ Key: 'key', Value: 'val' }],
    },
    false,
  ],
  // No Tags
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
    },
    false,
  ],
  // Tags not array
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
      Tags: 'notArray',
    },
    false,
  ],
  // EncrpytionKey not ARN
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
      EncryptionKey: 'test',
    },
    false,
  ],
  // EncryptionKey not string
  [
    {
      Description: 'Test Desc',
      NamePrefix: 'prefix',
      Tags: [{ Key: 'key', Value: 'val' }],
      EncryptionKey: {},
    },
    false,
  ],
])('implementsINewSecretProps: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsINewSecretProps(value)).toEqual(doesImplement);
});

test.each([
  // Valid
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
    },
    true,
  ],
  // Value not defined
  [undefined, false],
  // Value not object
  ['test', false],
  // No Passphrase
  [
    {
      Secret: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Secret',
    },
    false,
  ],
  // Non ARN Passphrase
  [
    {
      Passphrase: 'badArn',
      Secret: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Secret',
    },
    false,
  ],
  // Non string Passphrase
  [
    {
      Passphrase: {},
      Secret: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Secret',
    },
    false,
  ],
  // No Secret
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
    },
    false,
  ],
  // Non ARN Secret
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: 'badArn',
    },
    false,
  ],
  // Non string Secret
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {},
    },
    false,
  ],
  // Extra field
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      Extra: 'test',
    },
    true,
  ],
])('implementsIX509ResourceProperties: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsIX509ResourceProperties(value)).toEqual(doesImplement);
});

test.each([
  // Valid
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      DistinguishedName: { CN: 'test' },
      SigningCertificate: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    true,
  ],
  // Valid, no SigningCertificate
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      DistinguishedName: { CN: 'test' },
    },
    true,
  ],
  // Value not defined
  [undefined, false],
  // Value not object
  ['test', false],

  // Bad IX509ResourceProperties
  [
    {
      Passphrase: '',
      Secret: {},
      DistinguishedName: { CN: 'test' },
      SigningCertificate: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    false,
  ],
  // Bad DistinguishedName
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      DistinguishedName: {},
      SigningCertificate: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    false,
  ],
  // Bad SigningCertificate
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      DistinguishedName: { CN: 'test' },
      SigningCertificate: {
        Cert: '',
        Key: '',
        Passphrase: '',
      },
    },
    false,
  ],

])('implementsIX509CertificateGenerate: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsIX509CertificateGenerate(value)).toEqual(doesImplement);
});

test.each([
  // Valid
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      Certificate: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    true,
  ],
  // Value not defined
  [undefined, false],
  // Value not object
  ['test', false],

  // Bad IX509ResourceProperties
  [
    {
      Passphrase: '',
      Secret: {},
      Certificate: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    false,
  ],
  // Bad Certificate
  [
    {
      Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      Secret: {
        Description: 'Test Desc',
        NamePrefix: 'prefix',
        Tags: [{ Key: 'key', Value: 'val' }],
      },
      Certificate: {
        Cert: '',
        Key: '',
        Passphrase: '',
      },
    },
    false,
  ],

])('implementsIX509CertificateEncodePkcs12: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsIX509CertificateEncodePkcs12(value)).toEqual(doesImplement);
});

test.each([
  // Valid
  [
    {
      Tags: [{ Key: 'key', Value: 'val' }],
      X509CertificatePem: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    true,
  ],
  // Value not defined
  [undefined, false],
  // Value not object
  ['test', false],
  // Bad X509CertificatePem
  [
    {
      Tags: [{ Key: 'key', Value: 'val' }],
      X509CertificatePem: {
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    false,
  ],
  // Bad Tags
  [
    {
      Tags: [{ Key: 'key' }],
      X509CertificatePem: {
        Cert: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert',
        Key: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Key',
        Passphrase: 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Passphrase',
      },
    },
    false,
  ],
])('implementsIAcmImportCertProps: %p returns %p', (value: any, doesImplement: boolean) => {
  expect(implementsIAcmImportCertProps(value)).toEqual(doesImplement);
});
