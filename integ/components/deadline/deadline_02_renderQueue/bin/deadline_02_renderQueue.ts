/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import { VersionQuery } from 'aws-rfdk/deadline';

import { RenderStruct } from '../../../../lib/render-struct';
import { DatabaseType, StorageStruct } from '../../../../lib/storage-struct';
import { RenderQueueTestingTier } from '../lib/renderQueue-testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Get unique tag for this integration test from environment variable
const integStackTag = process.env.INTEG_STACK_TAG!.toString();

// Create component stack
const componentTier = new Stack(app, 'RFDKInteg-RQ-ComponentTier' + integStackTag, {env});

// This will get the installers for the latest version of Deadline
const version = new VersionQuery(componentTier, 'VersionQuery');

// Add struct containing Deadline repository (the same repo is used for all test configurations)
const storage = new StorageStruct(componentTier, 'StorageStruct', {
  integStackTag,
  databaseType: DatabaseType.DocDB,
  version,
});

const structs: Array<RenderStruct> = [
  // Create test struct for Render Queue in http mode
  new RenderStruct(componentTier, 'RenderStructRQ1', {
    integStackTag,
    repository: storage.repo,
    protocol: 'http',
    version,
  }),
  //Create test struct for Render Queue in https mode
  new RenderStruct(componentTier, 'RenderStructRQ2', {
    integStackTag,
    repository: storage.repo,
    protocol: 'https',
    version,
  }),
];

new RenderQueueTestingTier(app, 'RFDKInteg-RQ-TestingTier' + integStackTag, { env, integStackTag, structs });
