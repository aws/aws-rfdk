/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { writeAsciiFile, writeBinaryFile } from '../../filesystem';
import { Certificate } from '../certificate';
import { DistinguishedName } from '../distinguished-name';

const exec = promisify(child_process.exec);
let tmpDir: string;

// Enable/disable debugging statements.
const DEBUG = false;
if (!DEBUG) {
  console.debug = () => {};
}

beforeAll(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp.'));
});

afterAll(async () => {
  const unlinks: Array<Promise<void>> = [];
  const filenames: string[] = await fs.promises.readdir(tmpDir);
  for (const file of filenames) {
    unlinks.push(fs.promises.unlink(path.join(tmpDir, file)));
  }
  await Promise.all(unlinks);
  await fs.promises.rmdir(tmpDir);
});

test('generate self-signed', async () => {
  // GIVEN
  const name: DistinguishedName = new DistinguishedName({
    CN: 'TestCN',
    O: 'TestO',
    OU: 'TestOU',
  });
  const passphrase = 'test_passphrase';

  // WHEN
  const certificate = await Certificate.fromGenerated(name, passphrase);

  const crtFileName = path.join(tmpDir, 'ss-ca.crt');
  const keyFileName = path.join(tmpDir, 'ss-ca.key');
  await writeAsciiFile(crtFileName, certificate.cert);
  await writeAsciiFile(keyFileName, certificate.key);
  const certOut = await exec(`openssl x509 -noout -text -in ${crtFileName}`);
  const certVerification: string = certOut.stdout;
  const keyOut = await exec(`openssl rsa -noout -text -check -passin env:PW -in ${keyFileName}`, { env: { PW: passphrase }});
  const keyVerification = keyOut.stdout;

  // THEN
  expect(certificate.cert).toContain('-----BEGIN CERTIFICATE-----');
  expect(certificate.cert).toContain('-----END CERTIFICATE-----');
  expect(certificate.key).toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
  expect(certificate.key).toContain('-----END ENCRYPTED PRIVATE KEY-----');
  expect(certificate.passphrase).toBe(passphrase);
  expect(certificate.certChain).toEqual('');

  expect(certVerification).toContain('Issuer: CN=TestCN, O=TestO, OU=TestOU');
  expect(certVerification).toContain('Subject: CN=TestCN, O=TestO, OU=TestOU');
  expect(certVerification).toContain('Version: 3 (0x2)');
  expect(certVerification).toContain('Public-Key: (2048 bit)');

  expect(keyVerification).toContain('RSA key ok');
  expect(keyVerification).toContain('Private-Key: (2048 bit)');
});

test('generate signed certificate', async () => {
  // GIVEN
  const caName: DistinguishedName = new DistinguishedName({
    CN: 'TestCN',
    O: 'TestO',
    OU: 'TestOU',
  });
  const certName: DistinguishedName = new DistinguishedName({
    CN: 'CertCN',
    O: 'CertO',
    OU: 'CertOU',
  });
  const ca = await Certificate.fromGenerated(caName, 'signing_passphrase');
  const passphrase: string = 'test_passphrase';

  // WHEN
  const certificate = await Certificate.fromGenerated(certName, passphrase, ca);

  const crtFileName = path.join(tmpDir, 'signed.crt');
  const crtChainFileName = path.join(tmpDir, 'chain.crt');
  const keyFileName = path.join(tmpDir, 'signed.key');
  await writeAsciiFile(crtFileName, certificate.cert);
  if (certificate.certChain) {
    await writeAsciiFile(crtChainFileName, certificate.certChain);
  }
  await writeAsciiFile(keyFileName, certificate.key);
  const certOut = await exec(`openssl x509 -noout -text -in ${crtFileName}`);
  const certVerification: string = certOut.stdout;
  const certChainOut = await exec(`openssl x509 -noout -text -in ${crtChainFileName}`);
  const certChainVerification: string = certChainOut.stdout;
  const keyOut = await exec(
    `openssl rsa -noout -text -check -passin env:PW -in ${keyFileName}`,
    { env: { PATH: process.env.PATH, PW: passphrase }},
  );
  const keyVerification = keyOut.stdout;

  // THEN
  expect(certificate.cert).toContain('-----BEGIN CERTIFICATE-----');
  expect(certificate.cert).toContain('-----END CERTIFICATE-----');
  // The cert chain should contain the signing cert
  expect(certificate.certChain).toContain(ca.cert);
  // The cert should not contain any chain
  expect(certificate.cert.indexOf('-----BEGIN CERTIFICATE-----')).toBe(certificate.cert.lastIndexOf('-----BEGIN CERTIFICATE-----'));
  expect(certificate.certChain).toContain('-----BEGIN CERTIFICATE-----');
  expect(certificate.certChain).toContain('-----END CERTIFICATE-----');
  expect(certificate.key).toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
  expect(certificate.key).toContain('-----END ENCRYPTED PRIVATE KEY-----');
  expect(certificate.passphrase).toBe(passphrase);

  expect(certVerification).toContain('Issuer: CN=TestCN, O=TestO, OU=TestOU');
  expect(certVerification).toContain('Subject: CN=CertCN, O=CertO, OU=CertOU');
  expect(certVerification).toContain('Public-Key: (2048 bit)');

  expect(certChainVerification).toContain('Issuer: CN=TestCN, O=TestO, OU=TestOU');
  expect(certChainVerification).toContain('Subject: CN=TestCN, O=TestO, OU=TestOU');
  expect(certChainVerification).toContain('Public-Key: (2048 bit)');

  expect(keyVerification).toContain('RSA key ok');
  expect(keyVerification).toContain('Private-Key: (2048 bit)');
});

test('convert to PKCS #12', async () => {
  const caName: DistinguishedName = new DistinguishedName({
    CN: 'TestCN',
    O: 'TestO',
    OU: 'TestOU',
  });
  const certName: DistinguishedName = new DistinguishedName({
    CN: 'CertCN',
    O: 'CertO',
    OU: 'CertOU',
  });
  const ca: Certificate = await Certificate.fromGenerated(caName, 'signing_passphrase');
  const passphrase: string = 'test_passphrase';
  const certificate: Certificate = await Certificate.fromGenerated(certName, passphrase, ca);
  const pkcs12Passphrase: string = 'test_passphrase';

  // WHEN
  const pkcs12Data: Buffer = await certificate.toPkcs12(pkcs12Passphrase);
  const fileName = path.join(tmpDir, 'cert.p12');
  await writeBinaryFile(fileName, pkcs12Data);
  const pkcs12Validation = await exec(
    `openssl pkcs12 -in ${fileName} -info -nodes -passin env:PW`,
    { env: { PATH: process.env.PATH, PW: pkcs12Passphrase } },
  );
  const validationOut = pkcs12Validation.stdout;

  // THEN
  expect(pkcs12Validation.stderr).toContain('MAC verified OK');
  // Must have the certificate's cert
  expect(validationOut).toContain('subject=/CN=CertCN/O=CertO/OU=CertOU\nissuer=/CN=TestCN/O=TestO/OU=TestOU\n-----BEGIN CERTIFICATE-----');
  // Must have the CA cert
  expect(validationOut).toContain('subject=/CN=TestCN/O=TestO/OU=TestOU\nissuer=/CN=TestCN/O=TestO/OU=TestOU\n-----BEGIN CERTIFICATE-----');
  // Must have the decrypted private key
  expect(validationOut).toContain('-----BEGIN PRIVATE KEY-----');
});

test('decrypt private key', async () => {
  // GIVEN
  const name: DistinguishedName = new DistinguishedName({
    CN: 'TestCN',
    O: 'TestO',
    OU: 'TestOU',
  });
  const passphrase = 'test_passphrase';
  const certificate = await Certificate.fromGenerated(name, passphrase);

  // WHEN
  const decryptedKey = await Certificate.decryptKey(certificate.key, passphrase);

  const crtFileName = path.join(tmpDir, 'ca.crt');
  const keyFileName = path.join(tmpDir, 'ca.key');
  await writeAsciiFile(crtFileName, certificate.cert);
  await writeAsciiFile(keyFileName, certificate.key);
  const expectedDecryptedKeyOut = await exec(
    `openssl rsa -in ${keyFileName} -passin env:PW`,
    { env: { PATH: process.env.PATH, PW: passphrase } },
  );

  const expectedDecryptedKey: string = expectedDecryptedKeyOut.stdout;

  // THEN
  expect(decryptedKey).toEqual(expectedDecryptedKey);
  // Must have the decrypted private key
  expect(decryptedKey).toContain('-----BEGIN RSA PRIVATE KEY-----');
});