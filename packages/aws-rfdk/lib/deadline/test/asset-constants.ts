/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Properly import from aws-rfdk. Not ideal
// to use a relative path here.
import { stringLike } from '@aws-cdk/assert';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
  linuxDownloadRunScriptBoilerplate,
  windowsDownloadRunScriptBoilerplate,
} from '../../core/test/asset-constants';
export { CWA_ASSET_LINUX, CWA_ASSET_WINDOWS, linuxDownloadRunScriptBoilerplate, windowsDownloadRunScriptBoilerplate };

// configureWorker.sh
export const CONFIG_WORKER_ASSET_LINUX = {
  Bucket: 'AssetParameterse90d5322c2b7457e7dbbacdfc3a350aa501f6a63b939475977f2464abb268b73S3Bucket1840D7FB',
  Key: 'AssetParameterse90d5322c2b7457e7dbbacdfc3a350aa501f6a63b939475977f2464abb268b73S3VersionKey7BA1309D',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  Bucket: 'AssetParametersb1df82abec8605ca7a4666803d27eafda3bd66a9db0e5366d61cdf3d184af8b2S3BucketD9C14531',
  Key: 'AssetParametersb1df82abec8605ca7a4666803d27eafda3bd66a9db0e5366d61cdf3d184af8b2S3VersionKey40FA52FC',
};

// installDeadlineRepository.sh
export const INSTALL_REPOSITORY_ASSET_LINUX = {
  Bucket: stringLike('AssetParameters*S3Bucket8EB24E17'),
};

// test.file
export const TEST_ASSET = {
  Bucket: stringLike('AssetParameters*S3Bucket5D5509D9'),
  Key: stringLike('AssetParameters*S3VersionKeyF19FF080'),
};

// installRepostitoryDirectConnection
export const REPO_DC_ASSET = {
  Bucket: stringLike('AssetParameters*S3Bucket87338EBD'),
  Key: stringLike('AssetParameters*S3VersionKeyB7FF7B3C'),
};

export const RQ_CONNECTION_ASSET = {
  Bucket: 'AssetParameters89a29e05a2a88ec4d4a02e847e3c3c9461d0154b326492f4cad655d4ca0bda98S3BucketC22E185C',
  Key: 'AssetParameters89a29e05a2a88ec4d4a02e847e3c3c9461d0154b326492f4cad655d4ca0bda98S3VersionKey0833D670',
};
