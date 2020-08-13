/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import { RenderStruct } from '../../../../lib/render-struct';
import { StorageStruct } from '../../../../lib/storage-struct';
import { WorkerStruct } from '../../../../lib/worker-struct';
import { TestingTier } from '../lib/testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Get unique tag for this integration test from environment variable
const integStackTag = process.env.INTEG_STACK_TAG!.toString();

// Create component stack
const componentTier1 = new Stack(app, 'RFDKInteg-WF1-ComponentTier' + integStackTag, {env});
const componentTier2 = new Stack(app, 'RFDKInteg-WF2-ComponentTier' + integStackTag, {env});

// Add structs containing Deadline repositories
const storage1 = new StorageStruct(componentTier1, 'StorageStructWF1', {
  integStackTag,
  provideDocdbEfs: true,
  useMongoDB: false,
});
const storage2 = new StorageStruct(componentTier2, 'StorageStructWF2', {
  integStackTag,
  provideDocdbEfs: true,
  useMongoDB: false,
});

// Create test struct for Render Queue in http mode
const render1 = new RenderStruct(componentTier1, 'RenderStructWF1', {
  integStackTag,
  repository: storage1.repo,
  protocol: 'http',
});
const render2 = new RenderStruct(componentTier2, 'RenderStructWF2', {
  integStackTag,
  repository: storage2.repo,
  protocol: 'https',
});

const worker1 = new WorkerStruct(componentTier1, 'WorkerStructWF1', {
  integStackTag,
  renderStruct: render1,
});

const worker2 = new WorkerStruct(componentTier2, 'WorkerStructWF2', {
  integStackTag,
  renderStruct: render2,
});

new TestingTier(app, 'RFDKInteg-WF-TestingTier' + integStackTag, {env, integStackTag, structs: [worker1, worker2]});
