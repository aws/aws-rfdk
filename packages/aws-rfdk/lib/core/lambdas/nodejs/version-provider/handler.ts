/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import {
  Platform,
  Product,
  Version,
  VersionProvider,
} from '../lib/version-provider';

/**
 * The input to this Custom Resource
 */
export interface IVersionProviderResourceProperties {
  /**
   * The version of Deadline to look up.
   */
  readonly versionString?: string,
}

/**
 * Output of this Custom Resource, it is all made up of a flat structure of strings to avoid issues with how the
 * results are tokenized by CDK to be used in constructs.
 */
export interface FlatVersionedUriOutput {
  /**
   * The S3 bucket holding the installers. This makes the assumption they are all in the same bucket.
   */
  readonly S3Bucket: string;

  /**
   * The major version of the Linux installer. For example, "a" in "a.b.c.d".
   */
  readonly MajorVersion: string;

  /**
   * The minor version of the Linux installer. For example, "b" in "a.b.c.d".
   */
  readonly MinorVersion: string;

  /**
   * The release version of the Linux installer. For example, "c" in "a.b.c.d".
   */
  readonly ReleaseVersion: string;

  /**
   * The patch version of the Linux installer. For example, "d" in "a.b.c.d".
   */
  readonly LinuxPatchVersion: string;

  /**
   * The object key of the Deadline repository installer for Linux.
   */
  readonly LinuxRepositoryInstaller: string;
}

/**
 * This custom resource will parse and return the S3 URI's of the Deadline installers and Docker recipes for use in
 * any constructs that need to install Deadline.
 */
export class VersionProviderResource extends SimpleCustomResource {
  readonly versionProvider: VersionProvider;

  constructor() {
    super();
    this.versionProvider = new VersionProvider();
  }

  /**
   * @inheritdoc
   */
  public validateInput(data: object): boolean {
    return this.implementsIVersionProviderResourceProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: IVersionProviderResourceProperties): Promise<FlatVersionedUriOutput> {
    const deadlinePlatFormVersionedUris = await this.versionProvider.getVersionUris({
      versionString: resourceProperties.versionString,
      platform: Platform.linux,
      product: Product.deadline,
    });

    const deadlineLinux = deadlinePlatFormVersionedUris.get(Platform.linux)!;
    const deadlineLinuxUris = deadlineLinux.Uris;

    const s3Bucket = this.parseS3BucketName(deadlineLinuxUris.bundle);
    const linuxRepoObjectKey = this.parseS3ObjectKey(deadlineLinuxUris.repositoryInstaller!);

    return {
      S3Bucket: s3Bucket,
      MajorVersion: deadlineLinux.MajorVersion,
      MinorVersion: deadlineLinux.MinorVersion,
      ReleaseVersion: deadlineLinux.ReleaseVersion,
      LinuxPatchVersion: deadlineLinux.PatchVersion,
      LinuxRepositoryInstaller: linuxRepoObjectKey,
    };
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: IVersionProviderResourceProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  private implementsIVersionProviderResourceProperties(value: any): boolean {
    if (!value || typeof(value) !== 'object') { return false; }

    if (value.versionString) {
      if (!Version.validateVersionString(value.versionString)) {
        console.log(`Failed to validate the version string: ${value.versionString}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Parses the S3 bucket name from an S3 URI.
   */
  private parseS3BucketName(uri: string): string {
    let bucketName;
    try {
      bucketName = this.findRegex(uri, /^s3:\/\/([A-Za-z0-9\-]+)\//)[1];
    } catch (e) {
      throw new Error(`Could not parse S3 bucket name from ${uri}`);
    }
    return bucketName;
  }

  /**
   * Parses the S3 object key from an S3 URI.
   */
  private parseS3ObjectKey(uri: string): string {
    let objectKey;
    try {
      objectKey = this.findRegex(uri, /^s3:\/\/[A-Za-z0-9\-]+\/([A-Za-z0-9\-\/\.]+)$/)[1];
    } catch (e) {
      throw new Error(`Could not parse S3 object key from ${uri}`);
    }
    return objectKey;
  }

  // Assumes a single capture is in the regex
  private findRegex(str: string, re: RegExp): RegExpMatchArray {
    const found = str.match(re);

    if (found === null) {
      throw new Error(`Couldn't find regular expression ${re} in ${str}`);
    }

    return found;
  }
}

/**
 * The handler used to provide the installer links for the requested version
 */
export async function handler(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const versionProvider = new VersionProviderResource();
  return await versionProvider.handler(event, context);
}
