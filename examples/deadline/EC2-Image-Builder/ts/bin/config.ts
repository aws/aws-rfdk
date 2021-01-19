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
   * The version of Deadline to install on the AMI. This needs to be exact, during synthesis the app will write this
   * value into the Image Builder component document that will get uploaded to Image Builder. The VersionQuery cannot
   * be used here because its version gets calculated in a Lambda during deployment and is not available at synthesis.
   * This should match the version defined in package.json that gets used by the staging script
   */
  public readonly deadlineVersion: string = '10.1.13.1';

  /**
   * This version is used for the version of the Deadline component and the image recipe in the DeadlineImage construct.
   * It must be bumped manually whenever changes are made to the recipe.
   */
  public readonly imageRecipeVersion: string = '1.0.0';

  /**
   * The AMI ID of the parent AMI to install Deadline onto. Be sure to provide an AMI that is in the region you
   * are deploying your app into. The example provided is for "Amazon Linux 2 AMI (HVM), SSD Volume Type (64-bit x86)"
   * in us-west-2.
   */
  public readonly deadlineLinuxParentAmiId: string = 'ami-0a36eb8fadc976275';

  /**
   * The AMI ID of the parent AMI to install Deadline onto. Be sure to provide an AMI that is in the region you
   * are deploying your app into. The example provided is for "Microsoft Windows Server 2019 Base with Containers"
   * in us-west-2.
   */
  public readonly deadlineWindowsParentAmiId: string = 'ami-0fc215f7e067fa459';
}

export const config = new AppConfig();
