/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import { UsageBasedLicense } from 'aws-rfdk/deadline';
import { MongoDbSsplLicenseAcceptance } from 'aws-rfdk';
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
  public readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA;

  /**
   * Fill this in if you want to receive alarm emails when:
   * 1) You are crossing thresholds on decreasing burst Credits on the Amazon EFS that is
   *  set up in the StorageTier, for the Deadline Repository.
   *
   * Note: When deploying, you will be sent an email asking to authorize these emails. If you do not authorize,
   * then you will receive no alarm emails.
   */
  public readonly alarmEmailAddress?: string;

  /**
   * The version of Deadline to use on the render farm. Some examples of pinned version values are "10", "10.1", or
   * "10.1.12"
   * @default The latest available version of Deadline is used
   */
  public readonly deadlineVersion?: string = '10.1.17.4';

  /**
   * A map of regions to Deadline Client Linux AMIs. Currently using:
   *   Deadline Worker Base Image Linux 2 10.1.17.4 with Houdini 18.0.287 and Mantra 18.0.287 2021-06-30T073302Z
   */
  public readonly deadlineClientLinuxAmiMap: Record<string, string> = {['us-west-2']: 'ami-01bedc3d422729a29'};

  /**
   * (Optional) A secret (in binary form) in SecretsManager that stores the UBL certificates in a .zip file.
   */
  // public readonly ublCertificatesSecretArn?: string = 'arn:aws:secretsmanager:us-west-2:#:secret:Certificates-#';
  public readonly ublCertificatesSecretArn?: string = 'arn:aws:secretsmanager:us-west-2:#:secret:UBLCertificates-#';

  /**
   * (Optional) The UBL licenses to use.
   */
  public readonly ublLicenses?: UsageBasedLicense[] = [ UsageBasedLicense.forHoudini(), UsageBasedLicense.forMantra() ];

  public readonly deadlineInstallerBucketName: string = 'rfdk-secrets-management-deadline-installers';
  public readonly deadlineInstallerObjectNameLinux: string = 'DeadlineClient-rev.10.1.18.2.31.g1ac1c7077-linux-x64-installer_rfdk-sm-1.run';
  public readonly deadlineInstallerObjectNameWindows: string = 'DeadlineClient-rev.10.1.18.2.31.g1ac1c7077-windows-installer_rfdk-sm-1.exe';

  /**
   * (Optional) The name of the EC2 keypair to associate with instances.
   */
  public readonly keyPairName?: string = '***';

  /**
   * Whether to use MongoDB to back the render farm.
   * If false, then we use Amazon DocumentDB to back the render farm.
   */
  public readonly deployMongoDB: boolean = false;

  /**
   * Whether to enable Deadline Secrets Management.
   */ 
  public readonly enableSecretsManagement: boolean = true;
  
  /**
   * A Secret in AWS SecretsManager that stores the admin credentials for Deadline Secrets Management.
   * If not defined and Secrets Management is enabled, an AWS Secret with admin credentials will be generated.
   */
  public readonly secretsManagementSecretArn?: string;

  /**
   * This is only relevant if deployMongoDB = true.
   *
   * Change this value to MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL
   * if you wish to accept the SSPL and proceed with MongoDB deployment.
   */
  public readonly acceptSsplLicense: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;
}

export const config = new AppConfig();
