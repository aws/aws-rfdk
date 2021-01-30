#!/usr/bin/env node
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import * as path from 'path';
import * as pkg from '../package.json';
import { MachineImage } from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import { SEPStack } from '../lib/sep-stack';
import { config } from './config';

// ------------------------------ //
// --- Validate Config Values --- //
// ------------------------------ //

if (!config.keyPairName) {
  console.log('EC2 key pair name not specified. You will not have SSH access to the render farm.');
}

if (config.deadlineClientLinuxAmiMap === {['region']: 'ami-id'}) {
  throw new Error('Deadline Client Linux AMI map is required but was not specified.');
}

// ------------------- //
// --- Application --- //
// ------------------- //

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();


new SEPStack(app, 'SEPStack', {
  env,
  dockerRecipesStagePath: path.join(__dirname, '..', pkg.config.stage_path), // Stage directory in config is relative, make it absolute
  workerMachineImage: MachineImage.genericLinux(config.deadlineClientLinuxAmiMap),
  keyPairName: config.keyPairName ?? undefined,
});
