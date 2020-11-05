/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Properly import from aws-rfdk. Not ideal
// to use a relative path here.
import { stringLike } from '@aws-cdk/assert';
import {CWA_ASSET_LINUX} from '../../core/test/asset-constants';
export {CWA_ASSET_LINUX};

// configureWorker.sh
export const CONFIG_WORKER_ASSET_LINUX = {
  Bucket: 'AssetParameters3915f098ad4813270754c05c4e236d137da778773dfb13912fa54f387cc5929aS3BucketE7DA333E',
  Key: 'AssetParameters3915f098ad4813270754c05c4e236d137da778773dfb13912fa54f387cc5929aS3VersionKey1C0D482D',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  // NOT USED IN ANY TESTS CURRENTLY
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

export const VERSION_QUERY_ASSET = {
  Bucket: stringLike('AssetParameters*S3Bucket8394B4B1'),
  Key: stringLike('AssetParameters*S3VersionKey246878CE'),
};
