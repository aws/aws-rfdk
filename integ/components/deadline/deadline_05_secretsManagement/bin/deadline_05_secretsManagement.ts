/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack, Aspects } from '@aws-cdk/core';
import {
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';
import { RenderStruct } from '../../../../lib/render-struct';

import { SSMInstancePolicyAspect } from '../../../../lib/ssm-policy-aspect';
import { StorageStruct } from '../../../../lib/storage-struct';
import { SecretsManagementTestingTier } from '../lib/secretsManagement-testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const integStackTag = process.env.INTEG_STACK_TAG!.toString();

const componentTier = new Stack(app, 'RFDKInteg-SM-ComponentTier' + integStackTag, {env});

const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();
// Stage docker recipes, which include the repo installer in (`recipes.version`)
const recipes = new ThinkboxDockerRecipes(componentTier, 'DockerRecipes', {
  stage: Stage.fromDirectory(stagePath),
});

const storageStruct = new StorageStruct(componentTier, 'StorageStruct', {
  integStackTag,
  version: recipes.version,
  enableSecretsManagement: true,
});

const renderStruct = new RenderStruct(componentTier, 'RenderStruct', {
  integStackTag,
  protocol: 'https',
  recipes,
  repository: storageStruct.repo,
});

new SecretsManagementTestingTier(app, 'RFDKInteg-SM-TestingTier' + integStackTag, {
  env,
  integStackTag,
  renderStruct,
  storageStruct,
});

// Adds IAM Policy to Instance and ASG Roles
Aspects.of(app).add(new SSMInstancePolicyAspect());
