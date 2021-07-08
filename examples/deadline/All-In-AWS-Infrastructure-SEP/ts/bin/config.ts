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
   * A map of regions to Deadline Client Linux AMIs. As an example, the base Linux Deadline 10.1.19.4 AMI ID from us-west-2
   * is filled in. It can be used as-is, added to, or replaced.
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-04ae356533dc07fb5'};

  /**
   * Whether the DeadlineResourceTracker stack and supporting resources already exist in the account/region you are deploying to.
   *
   * If this is false, resources required by the Deadline Resource Tracker will be deployed into your account.
   * If this is true, these resources will be skipped.
   *
   * @default false
   */
  public readonly deadlineResourceTrackerExists: boolean = false;
}

export const config = new AppConfig();
