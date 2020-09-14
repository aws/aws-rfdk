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
  Bucket: 'AssetParametersf252aaab8e8ad001500875f428fe421863a979c5c1d7af8e9a1d9598d51fd23dS3BucketABC3C276',
  Key: 'AssetParametersf252aaab8e8ad001500875f428fe421863a979c5c1d7af8e9a1d9598d51fd23dS3VersionKeyDA9A3166',
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
  Bucket: 'AssetParameters63694479464606109bdbd3525fb2bef7b2abfbf196d8a132832c8e5d8a3c4796S3BucketF3231D14',
  Key: 'AssetParameters63694479464606109bdbd3525fb2bef7b2abfbf196d8a132832c8e5d8a3c4796S3VersionKeyE501DFB8',
};
