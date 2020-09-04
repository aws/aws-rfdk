/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import { RenderStruct } from '../../../../lib/render-struct';
import { StorageStruct } from '../../../../lib/storage-struct';
import { TestingTier } from '../lib/testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Get unique tag for this integration test from environment variable
const integStackTag = process.env.INTEG_STACK_TAG!.toString();

// Create component stack
const componentTier = new Stack(app, 'RFDKInteg-RQ-ComponentTier' + integStackTag, {env});

// Add struct containing Deadline repository (the same repo is used for all test configurations)
const storage = new StorageStruct(componentTier, 'StorageStruct', {
  integStackTag,
  provideDocdbEfs: true,
  useMongoDB: false,
});

// Create test struct for Render Queue in http mode
const render1 = new RenderStruct(componentTier, 'RenderStructRQ1', {
  integStackTag,
  repository: storage.repo,
  protocol: 'http',
});
//Create test struct for Render Queue in https mode
const render2 = new RenderStruct(componentTier, 'RenderStructRQ2', {
  integStackTag,
  repository: storage.repo,
  protocol: 'https',
});

new TestingTier(app, 'RFDKInteg-RQ-TestingTier' + integStackTag, {env, integStackTag, structs: [render1, render2] });
