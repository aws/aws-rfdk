/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsThinkboxEulaAcceptance } from 'aws-rfdk/deadline';

/**
 * Configuration values for the sample app.
 *
 * TODO: Fill these in with your own values.
 */
class AppConfig {
  /**
   * Change this value to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA if you wish to accept the EULA for
   * Deadline and proceed with Deadline deployment. Users must explicitly accept the AWS Thinkbox EULA before using the
   * AWS Thinkbox Deadline container images.
   *
   * See https://www.awsthinkbox.com/end-user-license-agreement for the terms of the agreement.
   */
  public readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA;

  /**
   * The version of Deadline to install on the AMI. This can be either a partial version that will use the latest patch, such as
   * '10.1' or '10.1.13', or a full version that will be pinned to a specific patch release, such as '10.1.13.1'.
   */
  public readonly deadlineVersion: string = '10.1';

  /**
   * This version is used for the version of the Deadline component and the image recipe in the DeadlineMachineImage construct.
   * It must be bumped manually whenever changes are made to the recipe.
   */
  public readonly imageRecipeVersion: string = '1.0.0';
}

export const config = new AppConfig();
