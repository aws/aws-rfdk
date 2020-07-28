/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import { StorageStruct } from '../../../../lib/storage-struct';
import { TestingTier } from '../lib/testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const integStackTag = process.env.INTEG_STACK_TAG!.toString();

const deadlineVersion = process.env.DEADLINE_VERSION!.toString();
const deadlineRepositoryInstallerPath = process.env.DEADLINE_REPOSITORY_INSTALLER_PATH?.toString();
const deadlineRepositoryInstallerBucketName = process.env.DEADLINE_REPOSITORY_INSTALLER_BUCKET_NAME?.toString();
const deadlineRepositoryInstallerObjectKey = process.env.DEADLINE_REPOSITORY_INSTALLER_OBJECT_KEY?.toString();

const deadlineRepositoryInstallationConfig = {
  deadlineVersion,
  deadlineRepositoryInstallerPath,
  deadlineRepositoryInstallerBucketName,
  deadlineRepositoryInstallerObjectKey,
};

const componentTier = new Stack(app, 'RFDKInteg-DL-ComponentTier' + integStackTag, {env});
const storage1 = new StorageStruct(componentTier, 'StorageStruct1', {
  integStackTag,
  provideDocdbEfs: 'false',
  deadlineRepositoryInstallationConfig,
});
const storage2 = new StorageStruct(componentTier, 'StorageStruct2', {
  integStackTag,
  provideDocdbEfs: 'true',
  deadlineRepositoryInstallationConfig,
});

new TestingTier(app, 'RFDKInteg-DL-TestingTier' + integStackTag, { env, integStackTag, structs: [storage1, storage2] });
