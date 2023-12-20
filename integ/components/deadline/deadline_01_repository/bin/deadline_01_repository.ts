/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack, Aspects } from 'aws-cdk-lib';
import { AutoScalingGroupRequireImdsv2Aspect } from 'aws-cdk-lib/aws-autoscaling';
import { InstanceRequireImdsv2Aspect, LaunchTemplateRequireImdsv2Aspect } from 'aws-cdk-lib/aws-ec2';
import {
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';
import { LogRetentionRetryAspect } from '../../../../lib/log-retention-retry-aspect';

import { SSMInstancePolicyAspect } from '../../../../lib/ssm-policy-aspect';
import { DatabaseType, StorageStruct } from '../../../../lib/storage-struct';
import { RepositoryTestingTier } from '../lib/repository-testing-tier';

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const integStackTag = process.env.INTEG_STACK_TAG!.toString();

const componentTier = new Stack(app, 'RFDKInteg-DL-ComponentTier' + integStackTag, {env});

const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();
// Stage docker recipes, which include the repo installer in (`recipes.version`)
const recipes = new ThinkboxDockerRecipes(componentTier, 'DockerRecipes', {
  stage: Stage.fromDirectory(stagePath),
});

const structs: Array<StorageStruct> = [
  new StorageStruct(componentTier, 'StorageStruct1', {
    integStackTag,
    version: recipes.version,
  }),
  new StorageStruct(componentTier, 'StorageStruct2', {
    integStackTag,
    databaseType: DatabaseType.DocDB,
    version: recipes.version,
  }),
  new StorageStruct(componentTier, 'StorageStruct3', {
    integStackTag,
    databaseType: DatabaseType.MongoDB,
    version: recipes.version,
  }),
];

new RepositoryTestingTier(app, 'RFDKInteg-DL-TestingTier' + integStackTag, { env, integStackTag, structs });

// Adds IAM Policy to Instance and ASG Roles
Aspects.of(app).add(new SSMInstancePolicyAspect());
// Adds log retention retry to all functions
Aspects.of(app).add(new LogRetentionRetryAspect());
// Require IMDSv2 on EC2
Aspects.of(app).add(new AutoScalingGroupRequireImdsv2Aspect());
Aspects.of(app).add(new InstanceRequireImdsv2Aspect({ suppressLaunchTemplateWarning: true }));
Aspects.of(app).add(new LaunchTemplateRequireImdsv2Aspect());
