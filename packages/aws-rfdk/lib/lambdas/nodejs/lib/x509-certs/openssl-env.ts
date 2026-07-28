/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns the environment that must be used when spawning the openssl CLI from an RFDK
 * Lambda function.
 *
 * The openssl binary is provided to these functions by an RFDK-published Lambda Layer, which
 * places the binary at /opt/bin/openssl and its shared libraries at /opt/lib. The Lambda
 * runtime environment puts /usr/bin ahead of /opt/bin on PATH and /usr/lib64 ahead of
 * /opt/lib on LD_LIBRARY_PATH, and on the AL2023-based runtimes (nodejs20.x/nodejs22.x) the
 * system openssl binary is not usable (e.g. "symbol lookup error: SSL_get_srp_g, version
 * OPENSSL_3.0.0"). Prepending the layer's directories guarantees that the layer-provided
 * binary and its matching libraries are always the ones used.
 *
 * @param extraEnv Additional environment variables to merge in (e.g. passphrase variables).
 */
export function opensslProcessEnv(extraEnv?: { [key: string]: string | undefined }): { [key: string]: string | undefined } {
  return {
    ...extraEnv,
    PATH: `/opt/bin:${process.env.PATH ?? ''}`,
    LD_LIBRARY_PATH: `/opt/lib:${process.env.LD_LIBRARY_PATH ?? ''}`,
  };
}
