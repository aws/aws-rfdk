/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, Stack, Aspects } from '@aws-cdk/core';
import {
  Stage,
  ThinkboxDockerRecipes,
  UsageBasedLicense,
} from 'aws-rfdk/deadline';
import {
  RenderStruct,
  RenderStructUsageBasedLicensingProps,
} from '../../../../lib/render-struct';
import { SepWorkerStruct } from '../../../../lib/sep-worker-struct';

import { SSMInstancePolicyAspect } from '../../../../lib/ssm-policy-aspect';
import {
  DatabaseType,
  StorageStruct,
} from '../../../../lib/storage-struct';
import { WorkerStruct } from '../../../../lib/worker-struct';
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
  databaseType: DatabaseType.DocDB,
});

const ubl = getUsageBasedLicensingProperties();
const renderStruct = new RenderStruct(componentTier, 'RenderStruct', {
  integStackTag,
  protocol: 'https',
  recipes,
  repository: storageStruct.repo,
  ubl,
});

const workerStruct = new WorkerStruct(componentTier, 'WorkerStruct', {
  integStackTag,
  renderStruct,
  os: 'Linux',
});

const sepWorkerStruct = new SepWorkerStruct(componentTier, 'SepWorkerStruct', {
  integStackTag,
  renderStruct,
});

new SecretsManagementTestingTier(app, 'RFDKInteg-SM-TestingTier' + integStackTag, {
  env,
  integStackTag,
  renderStruct,
  storageStruct,
  workerStruct,
  sepWorkerStruct,
});

// Adds IAM Policy to Instance and ASG Roles
Aspects.of(app).add(new SSMInstancePolicyAspect());

/**
 * If the UBL_CERTIFICATE_BUNDLE_SECRET_ARN env var is specified, this function parses the UBL_LICENSE_MAP environment variable
 * and returns an object containing the ARN of the UBL certificate secret and the UsageBasedLicenses that will be used.
 * Otherwise, it returns undefined.
 */
function getUsageBasedLicensingProperties(): RenderStructUsageBasedLicensingProps | undefined {
  const ublCertificateBundleSecretArn = process.env.UBL_CERTIFICATE_BUNDLE_SECRET_ARN;
  if (!ublCertificateBundleSecretArn) {
    throw new Error('UBL_CERTIFICATE_BUNDLE_SECRET_ARN is required but was not specified.');
  }

  const ublLicenseMap = process.env.UBL_LICENSE_MAP;
  if (!ublLicenseMap) {
    throw new Error('UBL_LICENSE_MAP must be specified when UBL_CERTIFICATE_BUNDLE_SECRET_ARN is specified.');
  }

  let parsedUblLicenseMap: {[license: string]: number};
  try {
    parsedUblLicenseMap = JSON.parse(ublLicenseMap);
  } catch (e) {
    throw new Error(`Failed to parse UBL_LICENSE_MAP: ${e}`);
  }

  const licenses = [...Object.keys(parsedUblLicenseMap).map(l => {
    const limit = parsedUblLicenseMap[l] > 0 ? parsedUblLicenseMap[l] : UsageBasedLicense.UNLIMITED;
    const funcName = `for${l}`;
    if (!(funcName in UsageBasedLicense)) {
      throw new Error(`Unsupported license "${l}". Please see the UsageBasedLicense class in RFDK for supported licenses.`);
    }
    // We need to bypass Typescript checks here to invoke the correct `for<license>` function
    // @ts-ignore
    return UsageBasedLicense[funcName](limit) as UsageBasedLicense;
  })];

  return {
    certificateBundleSecretArn: ublCertificateBundleSecretArn,
    licenses,
  };
}
