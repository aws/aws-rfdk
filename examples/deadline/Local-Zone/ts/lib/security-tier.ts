/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from '@aws-cdk/core';
import {
  X509CertificatePem,
} from 'aws-rfdk';

/**
 * The security tier of the render farm. This stack contains resources used to
 * ensure the render farm is secure.
 */
export class SecurityTier extends cdk.Stack {
  /**
   * Our self-signed root CA certificate for the internal endpoints in the farm.
   */
  readonly rootCa: X509CertificatePem;

  /**
   * Initializes a new instance of {@link SecurityTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for the security tier.
   */
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.rootCa = new X509CertificatePem(this, 'RootCA', {
      subject: {
        cn: 'SampleRootCA',
      },
    });
  }
};
