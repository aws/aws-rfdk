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
   * A map of regions to Deadline Client Linux AMIs. As an example, the base Linux Deadline 10.3.2.1 AMI ID from us-west-2
   * is filled in. It can be used as-is, added to, or replaced.
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-0b2bbe30ea8642cdd'};

  /**
   * Whether the DeadlineResourceTrackerAccessRole IAM role required by Deadline's Resource Tracker should be created in this CDK app.
   *
   * If you have previously used this same AWS account with either Deadline's AWS Portal feature or Spot Event Plugin and had used the
   * Deadline Resource Tracker, then you likely have this IAM role in your account already unless you have removed it.
   *
   * Note: Deadline's Resource Tracker only supports being used by a single Deadline Repository per AWS account.
   */
  public readonly createResourceTrackerRole: boolean = true;
}

export const config = new AppConfig();
