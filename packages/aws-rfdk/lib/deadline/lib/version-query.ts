/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path';

import {
  Code,
  SingletonFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import {
  Bucket,
} from '@aws-cdk/aws-s3';
import {
  Construct,
  CustomResource,
  Duration,
  Token,
} from '@aws-cdk/core';

import {
  IVersionProviderResourceProperties,
} from '../../core/lambdas/nodejs/version-provider';

import {
  IVersion,
  PlatformInstallers,
} from './version-ref';

/**
 * Properties for the Deadline Version
 */
export interface VersionQueryProps {
  /**
   * String containing the complete or partial deadline version.
   *
   * @default - the latest available version of deadline installer.
   */
  readonly version?: string;
}

/**
 * The abstract class for new or imported(custom) Deadline Version.
 */
abstract class VersionQueryBase extends Construct implements IVersion {
  /**
   * @inheritdoc
   */
  readonly abstract majorVersion: number;

  /**
   * @inheritdoc
   */
  readonly abstract minorVersion: number;

  /**
   * @inheritdoc
   */
  readonly abstract releaseVersion: number;

  /**
   * @inheritdoc
   */
  readonly abstract linuxInstallers: PlatformInstallers;

  /**
   * @inheritdoc
   */
  abstract linuxFullVersionString(): string;
}

/**
 * This class encapsulates information about a particular version of Thinkbox's Deadline software.
 * Information such as the version number, and where to get installers for that version from Amazon S3.
 *
 * The version of an official release of Deadline is always four numeric version components separated by dots.
 * ex: 10.1.8.5. We refer to the components in this version, in order from left-to-right, as the
 * major, minor, release, and patch versions. For example, Deadline version 10.1.8.5 is majorVersion 10, minorVersion 1,
 * releaseVersion 8, and patchVersion 5.
 *
 * All of the installers provided by an instance of this class must be for the same Deadline release (ex: 10.1.8),
 * but the patch versions may differ between operating systems depending on the particulars of that release of Deadline.
 * This class provides a simple way to query a version of Deadline prior to or during deployment of a
 * CDK app.
 *
 * You pass an instance of this class to various Deadline constructs in this library to tell those
 * constructs which version of Deadline you want them to use, and be configured for.
 */
export class VersionQuery extends VersionQueryBase {
  /**
   * @inheritdoc
   */
  readonly majorVersion: number;

  /**
   * @inheritdoc
   */
  readonly minorVersion: number;

  /**
   * @inheritdoc
   */
  readonly releaseVersion: number;

  /**
   * @inheritdoc
   */
  readonly linuxInstallers: PlatformInstallers;

  constructor(scope: Construct, id: string, props?: VersionQueryProps) {
    super(scope, id);

    const lambdaCode = Code.fromAsset(join(__dirname, '../..', 'core', 'lambdas', 'nodejs'));

    const lambdaFunc = new SingletonFunction(this, 'VersionProviderFunction', {
      uuid: '2e19e243-16ee-4d1a-a3c9-18d35eddd446',
      description: 'Used by the Version construct to get installer locations for a specific Deadline version.',
      code: lambdaCode,
      runtime: Runtime.NODEJS_12_X,
      handler: 'version-provider.handler',
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_WEEK,
    });

    const deadlineProperties: IVersionProviderResourceProperties = {
      versionString: props?.version,
    };

    const deadlineResource = new CustomResource(this, 'DeadlineResource', {
      serviceToken: lambdaFunc.functionArn,
      properties: deadlineProperties,
      resourceType: 'Custom::RFDK_DEADLINE_INSTALLERS',
    });

    this.majorVersion = Token.asNumber(deadlineResource.getAtt('MajorVersion'));
    this.minorVersion = Token.asNumber(deadlineResource.getAtt('MinorVersion'));
    this.releaseVersion = Token.asNumber(deadlineResource.getAtt('ReleaseVersion'));

    this.linuxInstallers = {
      patchVersion: Token.asNumber(deadlineResource.getAtt('LinuxPatchVersion')),
      repository: {
        objectKey: Token.asString(deadlineResource.getAtt('LinuxRepositoryInstaller')),
        s3Bucket: Bucket.fromBucketName(scope, 'InstallerBucket', Token.asString(deadlineResource.getAtt('S3Bucket'))),
      },
    };
  }

  public linuxFullVersionString(): string {
    const major = Token.isUnresolved(this.majorVersion) ? Token.asString(this.majorVersion) : this.majorVersion.toString();
    const minor = Token.isUnresolved(this.minorVersion) ? Token.asString(this.minorVersion) : this.minorVersion.toString();
    const release = Token.isUnresolved(this.releaseVersion) ? Token.asString(this.releaseVersion) : this.releaseVersion.toString();
    const patch = Token.isUnresolved(this.linuxInstallers.patchVersion)
      ? Token.asString(this.linuxInstallers.patchVersion)
      : this.linuxInstallers.patchVersion.toString();

    return `${major}.${minor}.${release}.${patch}`;
  }
}
