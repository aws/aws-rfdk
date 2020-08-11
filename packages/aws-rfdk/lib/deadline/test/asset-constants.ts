/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Properly import from aws-rfdk. Not ideal
// to use a relative path here.
import {CWA_ASSET_LINUX} from '../../core/test/asset-constants';
export {CWA_ASSET_LINUX};

// configureWorker.sh
export const CONFIG_WORKER_ASSET_LINUX = {
  Bucket: 'AssetParametersa0479044f4a09cd17839c6903e311d7f40bb13714c61e1bb089535e7e1cc1ff0S3Bucket8A63B685',
  Key: 'AssetParametersa0479044f4a09cd17839c6903e311d7f40bb13714c61e1bb089535e7e1cc1ff0S3VersionKeyC30DB6B8',
};

// configureWorker.ps1
export const CONFIG_WORKER_ASSET_WINDOWS = {
  // NOT USED IN ANY TESTS CURRENTLY
};

// installDeadlineRepository.sh
export const INSTALL_REPOSITORY_ASSET_LINUX = {
  Bucket: 'AssetParametersc9665579b439fb4c484ea0cdd9161799740dce332e235c3c09745644697f1efdS3Bucket8EB24E17',
};

// test.file
export const TEST_ASSET = {
  Bucket: 'AssetParameters95c924c84f5d023be4edee540cb2cb401a49f115d01ed403b288f6cb412771dfS3Bucket5D5509D9',
  Key: 'AssetParameters95c924c84f5d023be4edee540cb2cb401a49f115d01ed403b288f6cb412771dfS3VersionKeyF19FF080',
};

// installRepostitoryDirectConnection
export const REPO_DC_ASSET = {
  Bucket: 'AssetParametersc4ee7f2045a95cb6858f1fdf35253ca27103511dffd97ac97dfe2a8aae85d7fcS3Bucket87338EBD',
  Key: 'AssetParametersc4ee7f2045a95cb6858f1fdf35253ca27103511dffd97ac97dfe2a8aae85d7fcS3VersionKeyB7FF7B3C',
};

export const RQ_CONNECTION_ASSET = {
  Bucket: 'AssetParameters63694479464606109bdbd3525fb2bef7b2abfbf196d8a132832c8e5d8a3c4796S3BucketF3231D14',
  Key: 'AssetParameters63694479464606109bdbd3525fb2bef7b2abfbf196d8a132832c8e5d8a3c4796S3VersionKeyE501DFB8',
};
