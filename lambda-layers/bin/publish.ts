/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This script is meant to upload a Lambda Layer into an AWS account and give it public access. It first needs to be
 * transpiled using `yarn build` and AWS credentials for the account to be published into need to be set. Then its
 * usage is:
 *   node publish.js <layer_name>
 * The layer_name should map to a directory under the layers directory. Full instructions on how to build and publish
 * a Lambda Layer can be found in the README.
 */
import { Lambda } from 'aws-sdk';
import * as path from 'path';
import * as fs from 'fs';
import { getRegions } from '../lib/get-regions';
import { getMostRecentVersion } from '../lib/get-layer-version-info';

async function isDescriptionUpdated(
  descriptionText: string,
  lambda: Lambda,
  layerName: string,
): Promise<boolean> {
  const mostRecentVersion = await getMostRecentVersion(lambda, layerName);
  return mostRecentVersion?.Description !== descriptionText;
}

async function publishLayerToRegion(
  descriptionText: string,
  layerFileBuffer: Buffer,
  layerName: string,
  licenseText: string,
  region: string,
  runtimes: Array<string>,
): Promise<void> {
  const lambda = new Lambda({
    apiVersion: '2015-03-31',
    region,
  })
  if (await isDescriptionUpdated(descriptionText, lambda, layerName)) {
    try {
      const publishResult = await lambda.publishLayerVersion({
        LayerName: layerName,
        Content: {
          ZipFile: layerFileBuffer,
        },
        Description: descriptionText,
        LicenseInfo: licenseText,
        CompatibleRuntimes: runtimes,
      }).promise();

      if (publishResult.$response.error) {
        console.error(publishResult.$response.error);
        return;
      }
      if (!publishResult.Version) {
        console.error(`No version was returned for region: ${region}`);
        return;
      }
      lambda.addLayerVersionPermission({
        Action: 'lambda:GetLayerVersion',
        LayerName: layerName,
        Principal: '*',
        StatementId: 'PublicReadAccess',
        VersionNumber: publishResult.Version,
      }, function(err, data) {
        if (err) {
          console.error(err);
        } else {
          console.log(`Set permissions for ${layerName} in ${region} with statement: ${data.Statement}`);
        }
      });
    } catch (e) {
      console.error(`Failed publishing in ${region} with error: ${e}`);
    }
  } else {
    console.log(`No new version, skipping publish for ${region}`);
  }
}

if (process.argv.length !== 3) {
  throw new Error('Incorrect number of parameters. Usage:\n  node publish-layer.js <layerName>');
}
const layerName = process.argv[2];
const layerFileBuffer = fs.readFileSync(path.join(__dirname, `../layers/${layerName}/layer.zip`));
const descriptionText = fs.readFileSync(path.join(__dirname, `../layers/${layerName}/description.txt`)).toString().replace('\n', '');
const licenseText = fs.readFileSync(path.join(__dirname, `../layers/${layerName}/license.txt`)).toString().replace('\n', '');
const runtimesText = fs.readFileSync(path.join(__dirname, `../layers/${layerName}/runtimes.txt`)).toString().replace('\n', '');
const runtimes = runtimesText.split(' ');

getRegions().then(regions => {
  for (const region of regions) {
    publishLayerToRegion(
      descriptionText,
      layerFileBuffer,
      layerName,
      licenseText,
      region,
      runtimes,
    );
  }
});