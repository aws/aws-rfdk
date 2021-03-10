/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { stringLike } from '@aws-cdk/assert';

// ConfigureCloudWatchAgent.sh
export const CWA_ASSET_LINUX = {
  Bucket: 'AssetParametersf3261b0f6923b012a8fce5cd6984211bc48b9977844b3fa44229234dc6f21d43S3BucketCC60E56A',
  Key: 'AssetParametersf3261b0f6923b012a8fce5cd6984211bc48b9977844b3fa44229234dc6f21d43S3VersionKey027288B6',
};

// ConfigureCloudWatchAgent.ps1
export const CWA_ASSET_WINDOWS = {
  Bucket: 'AssetParametersb3a03a74afa8a045b35e08f11a719544622172869cc031787f580407d665ee36S3BucketE3A6D532',
  Key: 'AssetParametersb3a03a74afa8a045b35e08f11a719544622172869cc031787f580407d665ee36S3VersionKey0A26AF8C',
};

// mountEbsBlockVolume.sh + metadataUtilities.sh + ec2-certificates.crt
export const MOUNT_EBS_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketD23CD539'),
};

export const INSTALL_MONGODB_3_6_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketAF54A815'),
};
