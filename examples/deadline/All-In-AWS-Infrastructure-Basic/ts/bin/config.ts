/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import { UsageBasedLicense } from 'aws-rfdk/deadline';
import { MongoDbSsplLicenseAcceptance } from 'aws-rfdk';

/**
 * Configuration values for the sample app.
 *
 * TODO: Fill these in with your own values.
 */
class AppConfig {
  /**
   * The version of Deadline to run on the farm (matches the example AMI for 10.1.11.5 above).
   * @default The latest available version of Deadline is used
   */
  public readonly deadlineVersion?: string;

  /**
   * A map of regions to Deadline Client Linux AMIs. As an example, the Linux Deadline 10.1.12.1 AMI ID from us-west-2
   * is filled in. It can be used as-is, added to, or replaced. Ideally the version here should match the one in
   * package.json used for staging the render queue and usage based licensing recipes.
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-039f0c1faba28b015'};

  /**
   * (Optional) A secret (in binary form) in SecretsManager that stores the UBL certificates in a .zip file.
   */
  public readonly ublCertificatesSecretArn?: string;

  /**
   * (Optional) The UBL licenses to use.
   */
  public readonly ublLicenses?: UsageBasedLicense[];

  /**
   * (Optional) The name of the EC2 keypair to associate with instances.
   */
  public readonly keyPairName?: string;

  /**
   * Whether to use MongoDB to back the render farm.
   * If false, then we use Amazon DocumentDB to back the render farm.
   */
  public readonly deployMongoDB: boolean = false;

  /**
   * This is only relevant if deployMongoDB = true.
   *
   * Change this value to MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL
   * if you wish to accept the SSPL and proceed with MongoDB deployment.
   */
  public readonly acceptSsplLicense: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;
}

export const config = new AppConfig();
