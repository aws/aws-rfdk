/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { App, Stack, Aspects } from '@aws-cdk/core';
import * as archiver from 'archiver';
import {
  Stage,
  ThinkboxDockerRecipes,
  UsageBasedLicense,
} from 'aws-rfdk/deadline';
import * as AWS from 'aws-sdk';
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

const integStackTag = process.env.INTEG_STACK_TAG!.toString();

// Wrap the main code in a function to allow the async/await calls for creating the default UBL secret
async function main() {
  const app = new App();
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };

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

  const ubl = await getUsageBasedLicensingProperties();
  const renderStruct = new RenderStruct(componentTier, 'RenderStruct', {
    integStackTag,
    protocol: 'https',
    recipes,
    repository: storageStruct.repo,
    ubl,
  });

  new WorkerStruct(componentTier, 'WorkerStruct', {
    integStackTag,
    renderStruct,
    os: 'Linux',
  });

  new SepWorkerStruct(componentTier, 'SepWorkerStruct', {
    integStackTag,
    renderStruct,
  });

  new SecretsManagementTestingTier(app, 'RFDKInteg-SM-TestingTier' + integStackTag, {
    env,
    integStackTag,
    renderStruct,
    storageStruct,
  });

  // Adds IAM Policy to Instance and ASG Roles
  Aspects.of(app).add(new SSMInstancePolicyAspect());
}

/**
 * If the UBL_CERTIFICATE_BUNDLE_SECRET_ARN env var is specified, this function parses the UBL_LICENSE_MAP environment variable
 * and returns an object containing the ARN of the UBL certificate secret and the UsageBasedLicenses that will be used.
 * Otherwise, it creates a dummy secret with a fake maya.pfx certificate and a Maya license limit.
 */
async function getUsageBasedLicensingProperties(): Promise<RenderStructUsageBasedLicensingProps> {
  const ublCertificateBundleSecretArn = process.env.UBL_CERTIFICATE_BUNDLE_SECRET_ARN;
  if (ublCertificateBundleSecretArn) {
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
  } else {
    // Default to a dummy secret and license limits
    const secrets = new AWS.SecretsManager();
    const secretName = 'RFDKInteg-DummyUblCertificateSecret';

    let putSecret: (data: Buffer) => Promise<string>;
    try {
      const describeSecretResponse = await secrets.describeSecret({ SecretId: secretName }).promise();

      if (!describeSecretResponse.DeletedDate) {
        // Secret exists and is not scheduled for deletion, just return it.
        return {
          certificateBundleSecretArn: describeSecretResponse.ARN!,
          licenses: [UsageBasedLicense.forMaya()],
        };
      } else {
        // Secret exists but is marked for deletion, so we need to restore the secret then update its value
        putSecret = async data => {
          await secrets.restoreSecret({ SecretId: secretName }).promise();
          const updateSecretResponse = await secrets.updateSecret({ SecretId: secretName, SecretBinary: data }).promise();
          return updateSecretResponse.ARN!;
        };
      }
    } catch (e) {
      // eslint-disable-next-line
      console.log(`UBL secret with name ${secretName} not found.`);

      // Secret does not exist, so we need to create the secret
      putSecret = async data => {
        const createSecretResponse = await secrets.createSecret({
          Name: secretName,
          Description: 'Dummy UBL certificate bundle for RFDK integration tests',
          SecretBinary: data,
        }).promise();
        return createSecretResponse.ARN!;
      };
    }

    // Create dummy certificate bundle
    // eslint-disable-next-line
    console.log('Creating a dummy UBL secret...');
    const tmpdir = await fs.promises.mkdtemp(path.join('/tmp', 'dummyUblCerts'));
    const certBundlePath = await createDummyUblCertificates(tmpdir);

    const data = await fs.promises.readFile(certBundlePath);
    const secretArn = await putSecret(data);

    return {
      certificateBundleSecretArn: secretArn,
      licenses: [UsageBasedLicense.forMaya()],
    };
  }
}

/**
 * Creates a zip file with a dummy maya.pfx UBL ceritificate.
 * @param dirPath The path to create the certificate bundle in.
 * @returns The path to the certificate bundle file.
 */
function createDummyUblCertificates(dirPath: string): Promise<string> {
  return new Promise(async (res, rej) => {
    const outputPath = path.join(dirPath, 'certificates.zip');
    const output = fs.createWriteStream(outputPath);
    output.once('close', () => res(outputPath));

    const archive = archiver('zip');
    archive.on('warning', rej);
    archive.on('error', rej);
    archive.pipe(output);

    // Append a dummy maya.pfx file
    archive.append('', {
      name: 'maya.pfx',
    });

    await archive.finalize();
  });
}

void main();
