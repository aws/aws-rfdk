/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  OperatingSystemType,
} from '@aws-cdk/aws-ec2';
import {
  Asset,
} from '@aws-cdk/aws-s3-assets';
import {
  Construct,
  Stack,
} from '@aws-cdk/core';

import {
  IScriptHost,
} from './script-assets';

/**
 * Versions of MongoDB Community Edition that the {@link MongoDbInstaller} is
 * able to install.
 */
export enum MongoDbVersion {
  /**
   * MongoDB 3.6 Community Edition.
   * See: https://docs.mongodb.com/v3.6/introduction/
   */
  COMMUNITY_3_6 = '3.6',
}

/**
 * Choices for signifying the user's stance on the terms of the SSPL.
 * See: https://www.mongodb.com/licensing/server-side-public-license
 */
export enum MongoDbSsplLicenseAcceptance {
  /**
   * The user signifies their explicit rejection of the tems of the SSPL.
   */
  USER_REJECTS_SSPL = 0,

  /**
   * The user signifies their explicit acceptance of the terms of the SSPL.
   */
  USER_ACCEPTS_SSPL = 1,
}

/**
 * Properties that are required to create a {@link MongoDbInstaller}.
 */
export interface MongoDbInstallerProps {
  /**
   * MongoDB Community edition is licensed under the terms of the SSPL (see: https://www.mongodb.com/licensing/server-side-public-license ).
   * Users of MongoDbInstaller must explicitly signify their acceptance of the terms of the SSPL through this
   * property before the {@link MongoDbInstaller} will be allowed to install MongoDB.
   *
   * @default MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL
   */
  // Developer note: It is a legal requirement that the default be USER_REJECTS_SSPL.
  readonly userSsplAcceptance?: MongoDbSsplLicenseAcceptance;

  /**
   * The version of MongoDB to install.
   */
  readonly version: MongoDbVersion;
}

/**
 * This class provides a mechanism to install a version of MongoDB Community Edition during the
 * initial launch of an instance. MongoDB is installed from the official sources using the system
 * package manger (yum). It installs the mongodb-org metapackage which will install the following packages:
 * 1) mongodb-org-mongos;
 * 2) mongodb-org-server;
 * 3) mongodb-org-shell; and
 * 4) mongodb-org-tools.
 *
 * Successful installation of MongoDB with this class requires:
 * 1) Explicit acceptance of the terms of the SSPL license, under which MongoDB is distributed; and
 * 2) The instance on which the installation is being performed is in a subnet that can access
 * the official MongoDB sites: https://repo.mongodb.org/ and https://www.mongodb.org
 *
 * Resources Deployed
 * ------------------------
 * - A CDK Asset package containing the installation scripts is deployed to your CDK staging bucket.
 *
 * Security Considerations
 * ------------------------
 * - Since this class installs MongoDB from official sources dynamically during instance start-up, it is succeptable
 *   to an attacker compromising the official MongoDB Inc. distribution channel for MongoDB. Such a compromise may
 *   result in the installation of unauthorized MongoDB binaries. Executing this attack would require an attacker
 *   compromise both the official installation packages and the MongoDB Inc. gpg key with which they are signed.
 * - Using this construct on an instance will result in that instance dynamically downloading and running scripts
 *   from your CDK bootstrap bucket when that instance is launched. You must limit write access to your CDK bootstrap
 *   bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly recommend that
 *   you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS CloudTrail on your
 *   account to assist in post-incident analysis of compromised production environments.
 *
 * @ResourcesDeployed
 */
export class MongoDbInstaller {

  /**
   * The SSPL licensing message that is presented to the user if they create an instance of
   * this class without explicitly accepting the SSPL.
   *
   * Note to developers: The text of this string is a legal requirement, and must not be altered
   * witout approval.
   */
  private static readonly SSPL_ACCEPT_MESSAGE: string = `
The MongoDbInstaller will install MongoDB Community Edition onto one or more EC2 instances.

MongoDB is provided by MongoDB Inc. under the SSPL license. By installing MongoDB, you are agreeing to the terms of this license.
Follow the link below to read the terms of the SSPL license.
https://www.mongodb.com/licensing/server-side-public-license

By using the MongoDbInstaller to install MongoDB you agree to the terms of the SSPL license.

Please set the userSsplAcceptance property to USER_ACCEPTS_SSPL to signify your acceptance of the terms of the SSPL license.
`;

  constructor(protected readonly scope: Construct, protected readonly props: MongoDbInstallerProps) {
    // Legal requirement: Users of this class must agree to the terms of the SSPL, without exception.
    // Developer note: It is a legal requirement that the default be USER_REJECTS_SSPL, so this check
    // must throw an error for every value except USER_ACCEPTS_SSPL.
    if (props.userSsplAcceptance !== MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL) {
      throw new Error(MongoDbInstaller.SSPL_ACCEPT_MESSAGE);
    }
  }

  /**
   * Install MongoDB to the given instance at instance startup. This is accomplished by
   * adding scripting to the instance's UserData to install MongoDB.
   *
   * Notes:
   * 1) The instance on which the installation is being performed must be in a subnet that can access
   * the official MongoDB sites: https://repo.mongodb.org/ and https://www.mongodb.org; and
   * 2) At this time, this method only supports installation onto instances that are running an operating system
   * that is compatible with x86-64 RedHat 7 -- this includes Amazon Linux 2, RedHat 7, and CentOS 7.
   *
   * @param target The target instance onto which to install MongoDB.
   */
  public installOnLinuxInstance(target: IScriptHost) {
    if (target.osType !== OperatingSystemType.LINUX) {
      throw new Error('Target instance must be Linux.');
    }

    const installerScriptAsset = this.installerAssetSingleton();
    installerScriptAsset.grantRead(target.grantPrincipal);
    const installerScript: string = target.userData.addS3DownloadCommand({
      bucket: installerScriptAsset.bucket,
      bucketKey: installerScriptAsset.s3ObjectKey,
    });

    target.userData.addCommands(
      `bash ${installerScript}`,
    );
  }

  /**
   * Fetch the Asset singleton for the installation script, or generate it if needed.
   */
  protected installerAssetSingleton(): Asset {
    const stack = Stack.of(this.scope);
    const uuid = '5b141ac9-fde5-45d8-9961-b7108fb3b18a';
    const uniqueId = 'MongoDbInstallerAsset' + uuid.replace(/[-]/g, '');
    return (stack.node.tryFindChild(uniqueId) as Asset) ?? new Asset(stack, uniqueId, {
      path: path.join(__dirname, '..', 'scripts', 'mongodb', this.props.version, 'installMongoDb.sh'),
    });
  }
}
