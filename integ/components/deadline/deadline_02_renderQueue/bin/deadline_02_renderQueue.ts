/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack, Aspects } from 'aws-cdk-lib';
import {
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';

import { RenderStruct } from '../../../../lib/render-struct';
import { SSMInstancePolicyAspect } from '../../../../lib/ssm-policy-aspect';
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

const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();
// Stage docker recipes, which include the image used for the render queue instance and the repo
// installer (in `recipes.version`)
const recipes = new ThinkboxDockerRecipes(componentTier, 'DockerRecipes', {
  stage: Stage.fromDirectory(stagePath),
});

// Add struct containing Deadline repository (the same repo is used for all test configurations)
const storage = new StorageStruct(componentTier, 'StorageStruct', {
  integStackTag,
  databaseType: DatabaseType.DocDB,
  version: recipes.version,
});

const structs: Array<RenderStruct> = [
  // Create test struct for Render Queue in http mode
  new RenderStruct(componentTier, 'RenderStructRQ1', {
    integStackTag,
    repository: storage.repo,
    protocol: 'http',
    recipes,
  }),
  //Create test struct for Render Queue in https mode
  new RenderStruct(componentTier, 'RenderStructRQ2', {
    integStackTag,
    repository: storage.repo,
    protocol: 'https',
    recipes,
  }),
];

new RenderQueueTestingTier(app, 'RFDKInteg-RQ-TestingTier' + integStackTag, { env, integStackTag, structs });

// Adds IAM Policy to Instance and ASG Roles
Aspects.of(app).add(new SSMInstancePolicyAspect());
