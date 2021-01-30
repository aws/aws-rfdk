/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';

/**
 * Configuration values for the sample app.
 *
 * TODO: Fill these in with your own values.
 */
class AppConfig {
  /**
   * A map of regions to Deadline Client Linux AMIs. As an example, the Linux Deadline 10.1.12.1 AMI ID from us-west-2
   * is filled in. It can be used as-is, added to, or replaced.
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-039f0c1faba28b015'};

  /**
   * (Optional) The name of the EC2 keypair to associate with instances.
   */
  public readonly keyPairName?: string;
}

export const config = new AppConfig();
