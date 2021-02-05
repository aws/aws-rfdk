/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
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
} from '../../lambdas/nodejs/version-provider';

import { Version } from './version';
import {
  IReleaseVersion,
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
  readonly abstract versionString: string;

  /**
   * @inheritdoc
   */
  abstract linuxFullVersionString(): string;

  /**
   * @inheritdoc
   */
  abstract isLessThan(other: Version): boolean;
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
   * Regular expression for valid version query expressions
   */
  private static readonly EXPRESSION_REGEX = /^(?:(\d+)(?:\.(\d+)(?:\.(\d+)(?:\.(\d+))?)?)?)?$/;

  /**
   * The expression used as input to the `VersionQuery`
   */
  readonly expression?: string;

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

  /**
   * Custom resource that provides the resolved Deadline version components and installer URIs
   */
  private readonly deadlineResource: CustomResource;

  /**
   * The pinned numeric version components extracted from the VersionQuery expression.
   */
  private readonly pinnedVersionComponents: number[];

  constructor(scope: Construct, id: string, props?: VersionQueryProps) {
    super(scope, id);

    this.expression = props?.version;

    const match = (props?.version ?? '').match(VersionQuery.EXPRESSION_REGEX);
    if (match === null) {
      throw new Error(`Invalid version expression "${props!.version}`);
    }
    this.pinnedVersionComponents = (
      match
        // First capture group is the entire matched string, so slice it off
        .slice(1)
        // Capture groups that are not matched return as undefined, so we filter them out
        .filter(component => component)
        // Parse strings to numbers
        .map(component => Number(component))
    );

    const lambdaCode = Code.fromAsset(join(__dirname, '..', '..', 'lambdas', 'nodejs'));

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
      // If we don't have a full static version string, create a random string that will force the Lambda to always
      // run on redeploys, effectively checking for version updates.
      forceRun: this.forceRun(props?.version),
    };

    this.deadlineResource = new CustomResource(this, 'DeadlineResource', {
      serviceToken: lambdaFunc.functionArn,
      properties: deadlineProperties,
      resourceType: 'Custom::RFDK_DEADLINE_INSTALLERS',
    });

    this.majorVersion = this.versionComponent({
      expressionIndex: 0,
      customResourceAttribute: 'MajorVersion',
    });
    this.minorVersion = this.versionComponent({
      expressionIndex: 1,
      customResourceAttribute: 'MinorVersion',
    });
    this.releaseVersion = this.versionComponent({
      expressionIndex: 2,
      customResourceAttribute: 'ReleaseVersion',
    });

    this.linuxInstallers = {
      patchVersion: Token.asNumber(this.deadlineResource.getAtt('LinuxPatchVersion')),
      repository: {
        objectKey: this.deadlineResource.getAttString('LinuxRepositoryInstaller'),
        s3Bucket: Bucket.fromBucketName(scope, 'InstallerBucket', this.deadlineResource.getAttString('S3Bucket')),
      },
    };
  }

  private versionComponent(args: {
    expressionIndex: number,
    customResourceAttribute: string
  }) {
    const { expressionIndex, customResourceAttribute } = args;
    return this.pinnedVersionComponents.length > expressionIndex
      ? this.pinnedVersionComponents[expressionIndex]
      : Token.asNumber(this.deadlineResource.getAtt(customResourceAttribute));
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

  public isLessThan(other: Version): boolean {
    if (other.patchVersion !== 0) {
      throw new Error('Cannot compare a VersionQuery to a fully-qualified version with a non-zero patch number');
    }

    // We compare each component from highest order to lowest
    const componentGetters: Array<(version: IReleaseVersion) => number> = [
      v => v.majorVersion,
      v => v.minorVersion,
      v => v.releaseVersion,
    ];

    for (const componentGetter of componentGetters) {
      const thisComponent = componentGetter(this);
      const otherComponent = componentGetter(other);

      if (Token.isUnresolved(thisComponent)) {
        // Unresolved components are unpinned. These will resolve to the latest and are not less than any provided
        // version
        return false;
      } else {
        const componentDiff = thisComponent - otherComponent;
        if (componentDiff !== 0) {
          // If the components are different, return whether this component is smaller than the other component
          return componentDiff < 0;
        }
      }
    }

    // If we've exited the loop naturally, it means all version components are pinned and equal. This means the version
    // is not less than the other, they are the same
    return false;
  }

  /**
   * Check if we have a full version in the supplied version string. If we don't, we want to make sure the Lambda
   * that fetches the full version number and the installers for it is always run. This allows for Deadline updates
   * to be discovered.
   */
  private forceRun(version?: string): string | undefined {
    return !this.isFullVersion(version) ? randomBytes(32).toString('base64').slice(0, 32) : undefined;
  }

  /**
   * Checks if the supplied version contains the major, minor, release, and patch version numbers,
   * and returns true only if all 4 are supplied.
   */
  private isFullVersion(version?: string): boolean {
    const components = version?.split('.').map(x => parseInt(x));
    if (!components || components?.length != 4) {
      return false;
    }
    return true;
  }

  public get versionString(): string {
    return this.expression ?? '(latest)';
  }
}
