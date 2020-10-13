/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import { DatabaseType, StorageStruct } from '../../../../lib/storage-struct';
import { RepositoryTestingTier } from '../lib/repository-testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const integStackTag = process.env.INTEG_STACK_TAG!.toString();

const componentTier = new Stack(app, 'RFDKInteg-DL-ComponentTier' + integStackTag, {env});

const structs: Array<StorageStruct> = [
  new StorageStruct(componentTier, 'StorageStruct1', {
    integStackTag,
  }),
  new StorageStruct(componentTier, 'StorageStruct2', {
    integStackTag,
    databaseType: DatabaseType.DocDB,
  }),
  new StorageStruct(componentTier, 'StorageStruct3', {
    integStackTag,
    databaseType: DatabaseType.MongoDB,
  }),
];

new RepositoryTestingTier(app, 'RFDKInteg-DL-TestingTier' + integStackTag, { env, integStackTag, structs });
