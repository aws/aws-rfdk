/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
//import { DynamoDB, SecretsManager } from 'aws-sdk';

//import { LambdaContext } from '../lib/aws-lambda';
// import { CfnRequestEvent, DynamoBackedCustomResource } from '../lib/custom-resource';
// import {
//   SEPSpotFleet,
// } from '../lib/sep-configuration';
//import { Secret } from '../lib/secrets-manager';

/**
 * TODO
 */
export class SEPConfiguratorResource { // TODO: extends DynamoBackedCustomResource
  // readonly SEPSpotFleet: SEPSpotFleet;

  constructor() {
    // super(); TODO
    // this.SEPSpotFleet = new SEPSpotFleet();
  }

  //   /**
  //    * @inheritdoc
  //    */
  //   public validateInput(data: object): boolean {
  //     return this.implementsIVersionProviderResourceProperties(data);
  //   }

  //   /**
  //    * @inheritdoc
  //    */
  //   // @ts-ignore  -- we do not use the physicalId
  //   public async doCreate(physicalId: string, resourceProperties: IVersionProviderResourceProperties): Promise<FlatVersionedUriOutput> {
  //     const deadlinePlatFormVersionedUris = await this.versionProvider.getVersionUris({
  //       versionString: resourceProperties.versionString,
  //       platform: Platform.linux,
  //       product: Product.deadline,
  //     });

  //     const deadlineLinux = deadlinePlatFormVersionedUris.get(Platform.linux)!;
  //     const deadlineLinuxUris = deadlineLinux.Uris;

  //     const s3Bucket = this.parseS3BucketName(deadlineLinuxUris.bundle);
  //     const linuxRepoObjectKey = this.parseS3ObjectKey(deadlineLinuxUris.repositoryInstaller!);

  //     return {
  //       S3Bucket: s3Bucket,
  //       MajorVersion: deadlineLinux.MajorVersion,
  //       MinorVersion: deadlineLinux.MinorVersion,
  //       ReleaseVersion: deadlineLinux.ReleaseVersion,
  //       LinuxPatchVersion: deadlineLinux.PatchVersion,
  //       LinuxRepositoryInstaller: linuxRepoObjectKey,
  //     };
  //   }

  //   /**
  //    * @inheritdoc
  //    */
  //   /* istanbul ignore next */ // @ts-ignore
  //   public async doDelete(physicalId: string, resourceProperties: IVersionProviderResourceProperties): Promise<void> {
  //     // Nothing to do -- we don't modify anything.
  //     return;
  //   }

  //   private implementsIVersionProviderResourceProperties(value: any): boolean {
  //     if (!value || typeof(value) !== 'object') { return false; }

  //     if (value.versionString) {
  //       if (!Version.validateVersionString(value.versionString)) {
  //         console.log(`Failed to validate the version string: ${value.versionString}`);
  //         return false;
  //       }
  //     }

  //     if (value.forceRun && typeof(value.forceRun) !== 'string') { return false; }

  //     return true;
  //   }

  //   /**
  //    * Parses the S3 bucket name from an S3 URI.
  //    */
  //   private parseS3BucketName(uri: string): string {
  //     let bucketName;
  //     try {
  //       bucketName = this.findRegex(uri, /^s3:\/\/([A-Za-z0-9\-]+)\//)[1];
  //     } catch (e) {
  //       throw new Error(`Could not parse S3 bucket name from ${uri}`);
  //     }
  //     return bucketName;
  //   }

  //   /**
  //    * Parses the S3 object key from an S3 URI.
  //    */
  //   private parseS3ObjectKey(uri: string): string {
  //     let objectKey;
  //     try {
  //       objectKey = this.findRegex(uri, /^s3:\/\/[A-Za-z0-9\-]+\/([A-Za-z0-9\-\/\.]+)$/)[1];
  //     } catch (e) {
  //       throw new Error(`Could not parse S3 object key from ${uri}`);
  //     }
  //     return objectKey;
  //   }

  //   // Assumes a single capture is in the regex
  //   private findRegex(str: string, re: RegExp): RegExpMatchArray {
  //     const found = str.match(re);

  //     if (found === null) {
  //       throw new Error(`Couldn't find regular expression ${re} in ${str}`);
  //     }

  //     return found;
  //   }
}

//   /**
//    * The handler used to provide the installer links for the requested version
//    */
//   export async function handler(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
//     const versionProvider = new VersionProviderResource();
//     return await versionProvider.handler(event, context);
//   }