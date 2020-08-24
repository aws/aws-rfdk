/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { App } from '@aws-cdk/core';
import { NetworkTier } from '../lib/network-tier';

// Create a cdk app containing just a Vpc, that will then be used for the tests that follow
const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

if (!process.env.INTEG_STACK_TAG) {
  console.error('Cannot find variable INTEG_STACK_TAG');
}
else {
  const infrastructureStackTag = 'RFDKIntegInfrastructure' + process.env.INTEG_STACK_TAG!.toString();
  new NetworkTier(app, infrastructureStackTag, { env: env, tags: { StackName: infrastructureStackTag}});
}
