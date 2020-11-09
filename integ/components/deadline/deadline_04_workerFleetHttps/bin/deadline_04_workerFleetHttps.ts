/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack } from '@aws-cdk/core';
import {
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';

import { RenderStruct } from '../../../../lib/render-struct';
import { DatabaseType, StorageStruct } from '../../../../lib/storage-struct';
import { WorkerStruct } from '../../../../lib/worker-struct';
import { WorkerFleetTestingTier } from '../lib/workerFleetHttps-testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Get unique tag for this integration test from environment variable
const integStackTag = process.env.INTEG_STACK_TAG!.toString();

// Worker fleets with their own repository and render queue will be created for each permutation of OS and protocol
const oss = ['Linux','Windows'];

let structs: Array<WorkerStruct> = [];
let i = 1;
oss.forEach( os => {
  const testId = 'WFS' + i.toString();
  // Create component stack for structs
  const componentTier = new Stack(app, 'RFDKInteg-' + testId + '-ComponentTier' + integStackTag, {env});

  const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();
  // Stage docker recipes, which include image used for the render queue instance and the repo
  // installer (in `recipes.version`)
  const recipes = new ThinkboxDockerRecipes(componentTier, 'DockerRecipes', {
    stage: Stage.fromDirectory(stagePath),
  });

  // Create StorageStruct with repository
  const storage = new StorageStruct(componentTier, 'StorageStruct' + testId, {
    integStackTag,
    databaseType: DatabaseType.DocDB,
    version: recipes.version,
  });
  // Create render queue with HTTPS protocol
  const render = new RenderStruct(componentTier, 'RenderStruct' + testId, {
    integStackTag,
    repository: storage.repo,
    protocol: 'https',
    recipes,
  });
  // Create worker struct containing three nodes using either Linux or Windows
  structs.push(new WorkerStruct(componentTier, 'WorkerStruct' + testId, {
    integStackTag,
    renderStruct: render,
    os,
  }));
  i++;
});

new WorkerFleetTestingTier(app, 'RFDKInteg-WFS-TestingTier' + integStackTag, {env, integStackTag, structs});
