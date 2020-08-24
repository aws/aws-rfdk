/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vpc }from '@aws-cdk/aws-ec2';
import { Construct, Stack, StackProps } from '@aws-cdk/core';

export class NetworkTier extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Workaround: the maxAZs are limited to prevent exceeding account limits on subaddresses
    this.vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
    });
  }
}
