/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { stringLike } from '@aws-cdk/assert';

// ConfigureCloudWatchAgent.sh
export const CWA_ASSET_LINUX = {
  Bucket: 'AssetParameters3793207e75b2a1b5dd4ebe458ab7a5cc20154224e846267d2c22da1d0631f94fS3Bucket352E624B',
  Key: 'AssetParameters3793207e75b2a1b5dd4ebe458ab7a5cc20154224e846267d2c22da1d0631f94fS3VersionKeyAE2B9691',
};

// ConfigureCloudWatchAgent.ps1
export const CWA_ASSET_WINDOWS = {
  Bucket: 'AssetParameters05415690a7593cdde72555787eaac1d784dd3173e6083f23f83dc795bfe1741fS3Bucket0E53698F',
  Key: 'AssetParameters05415690a7593cdde72555787eaac1d784dd3173e6083f23f83dc795bfe1741fS3VersionKeyE92C9DEB',
};

// mountEbsBlockVolume.sh + metadataUtilities.sh + ec2-certificates.crt
export const MOUNT_EBS_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketD23CD539'),
};

export const INSTALL_MONGODB_3_6_SCRIPT_LINUX = {
  Bucket: stringLike('AssetParameters*S3BucketAF54A815'),
};

export const MONGODB_INSTANCE_3_6_SCRIPT = {
  Bucket: stringLike('AssetParameters*S3Bucket352E624B'),
};
