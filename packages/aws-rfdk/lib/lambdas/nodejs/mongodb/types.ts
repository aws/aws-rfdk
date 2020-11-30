/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isArn as isSecretArn } from '../lib/secrets-manager';

/**
 * Values required for establishing a connection to a TLS-enabled MongoDB server.
 */
export interface IConnectionOptions {
  /**
   * FQDN of the host to connect to.
   */
  readonly Hostname: string;

  /**
   * Port on the host that is serving MongoDB.
   */
  readonly Port: string;

  /**
   * ARN of a Secret containing login credentials. The contents must be a SecretString containing a JSON
   * document of the form:
   *     {
   *         "username": <login user>,
   *         "password": <login password>
   *     }
   */
  readonly Credentials: string;

  /**
   * ARN of a Secret containing the CA to validate the identity of the MongoDB server. The contents
   * must be a PEM-encoded certificate in the SecretString of the secret.
   */
  readonly CaCertificate: string;
}

/**
 * Information regarding a user to add to the DB that can authenticate via X.509 certificate.
 */
export interface IX509AuthenticatedUser {

  /**
   * Certificate providing subject/identity for the user.
   */
  readonly Certificate: string;

  /**
   * JSON encoded MongoDB roles array for the user.
   */
  readonly Roles: string;
}

/**
 * Resource arguments for the MongoDbConfigure Custom Resource handler.
 */
export interface IMongoDbConfigureResource {
  /**
   * Connection info for logging into the MongoDB application server.
   */
  readonly Connection: IConnectionOptions;

  /**
   * List of ARNs to Secrets containing password-authenticated credentials & roles for users to be created.
   *
   * @default No such users are created.
   */
  readonly PasswordAuthUsers?: string[];

  readonly X509AuthUsers?: IX509AuthenticatedUser[];
}

export function implementsIConnectionOptions(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!value.Hostname || typeof(value.Hostname) !== 'string') { return false; }
  if (!value.Port || typeof(value.Port) !== 'string') { return false; }
  const portNum = Number.parseInt(value.Port, 10);
  if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) { return false; }
  for (const key of ['Credentials', 'CaCertificate']) {
    if (!value[key] || typeof(value[key]) !== 'string') { return false; }
    if (!isSecretArn(value[key])) { return false; }
  }
  return true;
}

export function implementsIX509AuthenticatedUser(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!value.Certificate || typeof(value.Certificate) !== 'string') { return false; }
  if (!isSecretArn(value.Certificate)) { return false; }
  if (!value.Roles || typeof(value.Roles) !== 'string') { return false; }
  try {
    JSON.parse(value.Roles);
  } catch (e) {
    return false;
  }
  return true;
}

export function implementsIMongoDbConfigureResource(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!implementsIConnectionOptions(value.Connection)) { return false; }
  if (value.PasswordAuthUsers) {
    if (!Array.isArray(value.PasswordAuthUsers)) { return false; }
    for (const arn of value.PasswordAuthUsers) {
      if (!isSecretArn(arn)) { return false; }
    }
  }
  if (value.X509AuthUsers) {
    if (!Array.isArray(value.X509AuthUsers)) { return false; }
    for (const user of value.X509AuthUsers) {
      if (!implementsIX509AuthenticatedUser(user)) { return false; }
    }
  }
  return true;
}
