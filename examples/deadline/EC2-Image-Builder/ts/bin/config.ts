/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsCustomerAgreementAndIpLicenseAcceptance } from 'aws-rfdk/deadline';

/**
 * Configuration values for the sample app.
 *
 * TODO: Fill these in with your own values.
 */
class AppConfig {
  /**
   * By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
   * and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
   * is AWS Content as defined in those Agreements.
   * To accept these terms, change the value here to AwsCustomerAgreementAndIpLicenseAcceptance.USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE
   */
  public readonly acceptAwsCustomerAgreementAndIpLicense: AwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE;

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
