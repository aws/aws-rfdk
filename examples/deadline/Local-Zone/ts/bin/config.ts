/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
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
   * The standard availability zones that the render farm will deploy into. It is recommended to use at least
   * two and they must be from the same region. The default values being provided are two of the four standard
   * zones in us-west-2, located in Oregon.
   */
  public readonly availabilityZonesStandard: string[] = ['us-west-2a', 'us-west-2b'];

  /**
   * The local availability zones that will hold the worker fleet. They must belong to the same region as the standard
   * zones. The default value being provided here is one of the two local zones in us-west-2, located in Los Angeles.
   */
  public readonly availabilityZonesLocal: string[] = ['us-west-2-lax-1a'];

  /**
   * The version of Deadline to use on the render farm. Some examples of pinned version values are "10", "10.1", or
   * "10.1.16"
   * @default 10.3.1 is used, to match the worker AMI ID provided below
   */
  public readonly deadlineVersion: string = '10.3.1';

  /**
   * A map of regions to Deadline Client Linux AMIs. As an example, the Linux Deadline 10.3.1.3 AMI ID from us-west-2
   * is filled in. It can be used as-is, added to, or replaced. Ideally the version here should match the one in
   * package.json used for staging the render queue and usage based licensing recipes.
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-08a66350b8a662070'};

  /**
   * (Optional) The name of the EC2 keypair to associate with instances.
   */
  public readonly keyPairName?: string;
}

export const config = new AppConfig();
