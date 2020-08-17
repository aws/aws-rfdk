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

// Worker fleets with their own repository and render queue will be created for each permutation of OS and protocol
const oss = ['Linux','Windows'];
const protocols = ['http','https'];

let structs: Array<WorkerStruct> = [];
let i = 1;
oss.forEach( os => {
  protocols.forEach( protocol => {
    const testId = 'WF' + i.toString();
    // Create component stack for structs
    const componentTier = new Stack(app, 'RFDKInteg-' + testId + '-ComponentTier' + integStackTag, {env});
    // Create StorageStruct with repository
    const storage = new StorageStruct(componentTier, 'StorageStruct' + testId, {
      integStackTag,
      provideDocdbEfs: true,
      useMongoDB: false,
    });
    // Create render queue with either HTTP or HTTPS protocol
    const render = new RenderStruct(componentTier, 'RenderStruct' + testId, {
      integStackTag,
      repository: storage.repo,
      protocol,
    });
    // Create worker struct containing three nodes using either Linux or Windows
    structs.push(new WorkerStruct(componentTier, 'WorkerStruct' + testId, {
      integStackTag,
      renderStruct: render,
      os,
    }));
    i++;
  });
});

new TestingTier(app, 'RFDKInteg-WF-TestingTier' + integStackTag, {env, integStackTag, structs});
