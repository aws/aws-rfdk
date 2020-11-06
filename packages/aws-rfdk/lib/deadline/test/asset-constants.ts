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
  Bucket: 'AssetParameterscfbac966c059b6d160d9fe1be830ff2b4e3b3e8583d44c5e6a9ef3cc617cae52S3BucketEC9648BD',
  Key: 'AssetParameterscfbac966c059b6d160d9fe1be830ff2b4e3b3e8583d44c5e6a9ef3cc617cae52S3VersionKey14E8A825',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  Bucket: 'AssetParametersb78a6a7981377c750b127331abdcbd9f1ab312242da73512424611e965eea4c1S3BucketFDCB6ECC',
  Key: 'AssetParametersb78a6a7981377c750b127331abdcbd9f1ab312242da73512424611e965eea4c1S3VersionKey20AFBF6B',
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
  Bucket: stringLike('AssetParameters*S3Bucket6ABF873D'),
  Key: stringLike('AssetParameters*S3VersionKey5A5FE29C'),
};
