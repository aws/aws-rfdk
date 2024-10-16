/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This script will write out a TS file that contains an object with all the ARN's of the Lambda Layers that are passed
 * into it. This script expects that the Lambda Layers already exist in the account that the user is authenticated with.
 * It first needs to be transpiled using `yarn build` and AWS credentials for the account the Lambdas exist in need to
 * be set. Then its usage is:
 *   node write-ts.js <...layer_name>
 * Where `<...layer_name>` is a list of layer names that should be added to the file.
 */


import {
  LambdaClient,
} from '@aws-sdk/client-lambda';
import * as path from 'path';
import * as fs from 'fs';
import { getRegions } from '../lib/get-regions';
import { getMostRecentVersion } from '../lib/get-layer-version-info';

const LICENSE = '/**\n'
  + ' * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.\n'
  + ' * SPDX-License-Identifier: Apache-2.0\n'
  + ' */\n\n';
const DISABLE_LINTERS = '/* eslint-disable */\n';

async function writeTsFile(regions: Array<string>): Promise<void> {
  const layerNameToRegionToVersionArnMap: any = {};

  for (const layerName of layerNames) {
      const regionToLayerVersionArnMap: any = {};

      for (const region of regions) {
        try {
          const lambda = new LambdaClient({
            region,
          });
          const lambdaLayerVersion = await getMostRecentVersion(lambda, layerName);
          regionToLayerVersionArnMap[region] = lambdaLayerVersion?.LayerVersionArn;
          console.log(`Retrieved version for ${layerName} in ${region}`);
        } catch (e) {
          console.error(`Failed retrieving version for ${layerName} in ${region} with error: ${e}`);
        }
      }
      layerNameToRegionToVersionArnMap[layerName] = regionToLayerVersionArnMap;
  }
  fs.writeFileSync(
    outputFilePath,
    `${LICENSE}${DISABLE_LINTERS}export const ARNS = ${JSON.stringify(layerNameToRegionToVersionArnMap)};\n`);
}

if (process.argv.length < 3) {
  throw new Error('Incorrect number of parameters. Usage:\n node write-json.js <...layerName>');
}
const outputFile = '../../packages/aws-rfdk/lib/lambdas/lambdaLayerVersionArns.ts';

const layerNames = process.argv.slice(2);
const outputFilePath = path.join(__dirname, outputFile);

getRegions().then(writeTsFile);
