/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isArn as isKeyArn } from '../lib/kms';
import { isArn as isSecretArn } from '../lib/secrets-manager';
import { DistinguishedNameProps, implementsDistinguishedNameProps } from '../lib/x509-certs';

/**
 * Type to match the IX509Certificate defined by x509-certificate.ts
 */
export interface ISecretCertificate {
  /**
   * ARN of a Secret that contains the Certificate data
   */
  readonly Cert: string;

  /**
   * ARN of a Secret that contains the encrypted Private Key data
   */
  readonly Key: string;

  /**
   * ARN of a Secret that contains the passphrase of the encrypted Private Key
   */
  readonly Passphrase: string;

  /**
   * ARN of a Secret that contains the chain of Certificate used to sign this Certificate
   * @default: Empty string
   */
  readonly CertChain: string;
}

/**
 * Type to define the properties required to configure an X.509 Secret.
 */
export interface INewSecretProps {
  /**
   * String that is used as the suffix in the description for created secrets
   */
  readonly Description: string;

  /**
   * String to use as a prefix to the created Secrets' name
   */
  readonly NamePrefix: string;

  /**
   * Tags to apply to the created secret
   */
  readonly Tags: Array<{ Key: string, Value: string }>;

  /**
   * ARN of a KMS key to attach to the creates Secrets
   */
  readonly EncryptionKey?: string;
}

/**
 * Type to encapsulate the X.509 Secret and its passphrase.
 */
export interface IX509ResourceProperties {

  /**
   * ARN of a Secret containing the passphrase to use for the generated
   * certificate's private key.
   */
  readonly Passphrase: string;

  /**
   * Properties of the Secrets that the generated Certificate data will be stored within.
   */
  readonly Secret: INewSecretProps;
}

/**
 * Type to define the requirements for importing a certificate into ACM.
 */
export interface IAcmImportCertProps {
  /**
   * The Certificate, contained in Secrets, to be imported to ACM
   */
  readonly X509CertificatePem: ISecretCertificate;

  /**
   * Tags to apply to the imported certificate
   */
  readonly Tags: Array<{ Key: string, Value: string }>;
}

/**
 * Type to define additional properties needed to configure an X.509 certificate that is being generated.
 */
export interface IX509CertificateGenerate extends IX509ResourceProperties {
  /**
   *
   */
  readonly DistinguishedName: DistinguishedNameProps;

  /**
   * The certificate to use to digitally sign the Certificate that we will generate.
   * @default None; we generate a self-signed certificate
   */
  readonly SigningCertificate?: ISecretCertificate;
}

/**
 * Type to define additional properties needed to configure an X.509 certificate in the PKCS #12 format
 */
export interface IX509CertificateEncodePkcs12 extends IX509ResourceProperties {
  /**
   * The certificate that we will be encoding to PKCS #12 format.
   */
  readonly Certificate: ISecretCertificate;
}

export function implementsTag(value: any): boolean {
  if (!value || !Array.isArray(value)) { return false; }
  for (const tag of value) {
    if (typeof(tag) !== 'object') { return false; }
    if (!tag.Key || typeof(tag.Key) !== 'string') { return false; }
    if (!tag.Value || typeof(tag.Value) !== 'string') { return false; }
  }
  return true;
}

export function implementsISecretCertificate(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  for (const key of ['Cert', 'Key', 'Passphrase']) {
    if (!value[key] || typeof(value[key]) !== 'string') { return false; }
    if (!isSecretArn(value[key])) { return false; }
  }
  if (value.CertChain) {
    if (typeof(value.CertChain) !== 'string') { return false; }
    if (value.CertChain !== '' && !isSecretArn(value.CertChain)) { return false; }
  }
  return true;
}

export function implementsINewSecretProps(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!value.NamePrefix || typeof(value.NamePrefix) !== 'string') { return false; }
  if (value.EncryptionKey) {
    if (typeof(value.EncryptionKey) !== 'string') { return false; }
    if (!isKeyArn(value.EncryptionKey)) { return false; }
  }
  if (!value.Description || typeof(value.Description) !== 'string') { return false; }
  if (!implementsTag(value.Tags)) { return false; }

  return true;
}

export function implementsIX509ResourceProperties(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!value.Passphrase || typeof(value.Passphrase) !== 'string') { return false; }
  if (!isSecretArn(value.Passphrase)) { return false; }
  if (!implementsINewSecretProps(value.Secret)) { return false; }
  return true;
}

export function implementsIX509CertificateGenerate(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!implementsIX509ResourceProperties(value)) { return false; }
  if (!implementsDistinguishedNameProps(value.DistinguishedName)) { return false; }
  if (value.SigningCertificate && !implementsISecretCertificate(value.SigningCertificate)) { return false; }
  return true;
}

export function implementsIX509CertificateEncodePkcs12(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!implementsIX509ResourceProperties(value)) { return false; }
  if (!implementsISecretCertificate(value.Certificate)) { return false; }
  return true;
}

export function implementsIAcmImportCertProps(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!implementsISecretCertificate(value.X509CertificatePem)) { return false; }
  if (!implementsTag(value.Tags)) { return false; }
  return true;
}
