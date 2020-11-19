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

import {
  readAsciiFile,
  readBinaryFile,
  writeAsciiFile,
} from '../filesystem';
import { DistinguishedName } from './distinguished-name';

const exec = promisify(child_process.exec);

export interface ICertificate {
  readonly cert: string;
  readonly key: string;
  readonly passphrase: string;
  readonly certChain: string;
}

export class Certificate implements ICertificate {
  public static async fromGenerated(
    subject: DistinguishedName,
    passphrase: string,
    certValidFor?: number,
    signingCertificate?: Certificate,
  ): Promise<Certificate> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp.'));
    try {
      let cert: string;
      let key: string;
      let certChain: string;
      if (!signingCertificate) {
        [cert, key] = await Certificate.generateSelfSigned(tmpDir, subject, passphrase, certValidFor ?? 1095);
        // certChain cannot be left undefined. CFN expects that attributes will *always* have values.
        certChain = '';
      } else {
        [cert, key, certChain] = await Certificate.generateSigned(tmpDir, subject, passphrase, certValidFor ?? 1095, signingCertificate);
      }
      return new Certificate(cert, key, passphrase, certChain);
    } finally {
      const unlinks: Array<Promise<void>> = [];
      const filenames: string[] = await fs.promises.readdir(tmpDir);
      for (const file of filenames) {
        unlinks.push(fs.promises.unlink(path.join(tmpDir, file)));
      }
      await Promise.all(unlinks);
      await fs.promises.rmdir(tmpDir);
    }
  }

  public static async decryptKey(
    key: string,
    passphrase: string,
  ): Promise<string> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp.'));
    try {
      const encrypedKeyFile: string = path.join(tmpDir, 'encrypted.key');
      await writeAsciiFile(encrypedKeyFile, key);
      const decryptedKeyFile: string = path.join(tmpDir, 'decrypted.key');
      const cmd =
        'openssl rsa ' +
        `-in ${encrypedKeyFile} ` +
        '-passin env:CERT_PASSPHRASE ' +
        `-out ${decryptedKeyFile}`;

      console.debug(`Running: ${cmd}`);
      await exec(cmd, { env: { CERT_PASSPHRASE: passphrase, PATH: process.env.PATH } });

      const keyDecrypted = await readAsciiFile(decryptedKeyFile);

      return keyDecrypted;
    } finally {
      const unlinks: Array<Promise<void>> = [];
      const filenames: string[] = await fs.promises.readdir(tmpDir);
      for (const file of filenames) {
        unlinks.push(fs.promises.unlink(path.join(tmpDir, file)));
      }
      await Promise.all(unlinks);
      await fs.promises.rmdir(tmpDir);
    }
  }

  private static async generateSelfSigned(
    tmpDir: string,
    subject: DistinguishedName,
    passphrase: string,
    certValidFor: number,
  ): Promise<[string, string]> {
    const crtFile: string = path.join(tmpDir, 'crt');
    const keyFile: string = path.join(tmpDir, 'key');
    const cmd: string =
      'openssl req -x509 ' +
      '-passout env:CERT_PASSPHRASE ' +
      '-newkey rsa:2048 ' +
      `-days ${certValidFor} ` +
      '-extensions v3_ca ' +
      `-keyout ${keyFile} -out ${crtFile} ` +
      `-subj ${subject.toString()}`;

    console.debug(`Running: ${cmd}`);
    await exec(cmd, { env: { CERT_PASSPHRASE: passphrase, PATH: process.env.PATH } });

    const cert: string = await readAsciiFile(crtFile);
    const key: string = await readAsciiFile(keyFile);

    return [cert, key];
  }

  private static async generateSigned(
    tmpDir: string,
    subject: DistinguishedName,
    passphrase: string,
    certValidFor: number,
    signingCertificate: Certificate,
  ): Promise<[string, string, string]> {
    const signingCertFile = path.join(tmpDir, 'signing.crt');
    const signingKeyFile = path.join(tmpDir, 'signing.key');
    const caChain = signingCertificate.cert + signingCertificate.certChain;
    await writeAsciiFile(signingCertFile, caChain);
    await writeAsciiFile(signingKeyFile, signingCertificate.key);

    const csrFile: string = path.join(tmpDir, 'cert.csr');
    const crtFile: string = path.join(tmpDir, 'cert.crt');
    const keyFile: string = path.join(tmpDir, 'cert.key');

    const certSigningRequest =
            'openssl req ' +
            '-passout env:CERT_PASSPHRASE ' +
            '-newkey rsa:2048 ' +
            `-days ${certValidFor} ` +
            `-out ${csrFile} -keyout ${keyFile} ` +
            `-subj ${subject.toString()}`;
    const crtCreate =
            'openssl x509 -sha256 -req ' +
            '-passin env:SIGNING_PASSPHRASE ' +
            `-days ${certValidFor} ` +
            `-in ${csrFile} ` +
            `-CA ${signingCertFile} -CAkey ${signingKeyFile} -CAcreateserial ` +
            `-out ${crtFile}`;

    console.debug(`Running: ${certSigningRequest}`);
    await exec(certSigningRequest, { env: { CERT_PASSPHRASE: passphrase, PATH: process.env.PATH }});
    console.debug(`Running: ${crtCreate}`);
    await exec(crtCreate, { env: { PATH: process.env.PATH, SIGNING_PASSPHRASE: signingCertificate.passphrase }});

    const cert: string = await readAsciiFile(crtFile);
    const key: string = await readAsciiFile(keyFile);

    // Return the certificate, private key, and certificate chain. The certificate chain is the signing certificate
    // prepended to its own certificate chain.
    return [cert, key, caChain];
  }

  public readonly cert: string;
  public readonly key: string;
  public readonly passphrase: string;
  public readonly certChain: string;

  constructor(
    cert: string,
    key: string,
    passphrase: string,
    certChain: string,
  ) {
    this.cert = cert;
    this.key = key;
    this.passphrase = passphrase;
    this.certChain = certChain;
  }

  public async toPkcs12(passphrase: string): Promise<Buffer> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tmp.'));
    try {
      const crtFileName: string = path.join(tmpDir, 'input.crt');
      const keyFileName: string = path.join(tmpDir, 'input.key');
      const caCert = this.certChain ? this.cert + this.certChain : this.cert;
      await writeAsciiFile(crtFileName, caCert);
      await writeAsciiFile(keyFileName, this.key);

      const pkcs12FileName: string = path.join(tmpDir, 'cert.p12');
      const command: string = 'openssl pkcs12 -export -nodes -passin env:PASSIN -passout env:PASSOUT ' +
        `-out ${pkcs12FileName} -inkey ${keyFileName} -in ${crtFileName}`;
      await exec(
        command,
        { env: {
          PASSIN: this.passphrase,
          PASSOUT: passphrase,
          PATH: process.env.PATH,
        }},
      );

      const pkcs12Data: Buffer = await readBinaryFile(pkcs12FileName);

      return pkcs12Data;
    } finally {
      const unlinks: Array<Promise<void>> = [];
      const filenames: string[] = await fs.promises.readdir(tmpDir);
      for (const file of filenames) {
        unlinks.push(fs.promises.unlink(path.join(tmpDir, file)));
      }
      await Promise.all(unlinks);
      await fs.promises.rmdir(tmpDir);
    }
  }
}
