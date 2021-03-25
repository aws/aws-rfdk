#!/usr/bin/env node

/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from '@aws-cdk/core';

import { config } from './config';

import { BaseFarmStack } from '../lib/base-farm-stack';
import { ComputeStack } from '../lib/compute-stack';

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const baseFarm = new BaseFarmStack(app, 'BaseFarmStack', {
  env,
  deadlineVersion: config.deadlineVersion,
  acceptAwsThinkboxEula: config.acceptAwsThinkboxEula,
});

new ComputeStack(app, 'ComputeStack', {
  deadlineVersion: config.deadlineVersion,
  imageRecipeVersion: config.imageRecipeVersion,
  env,
  renderQueue: baseFarm.renderQueue,
  vpc: baseFarm.vpc,
});
