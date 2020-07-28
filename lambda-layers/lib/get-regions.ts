/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk';

// These regions need to be enabled for the AWS account being used for publishing, so we skip them
const REGION_DENY_LIST = [
  'af-south-1',
  'ap-east-1',
  'eu-south-1',
  'me-south-1',
];

function isValidRegion(region: string): boolean {
  return (
    !REGION_DENY_LIST.includes(region)
    && !region.startsWith('cn-')
    && !region.startsWith('us-gov-')
  );
}

export async function getRegions(): Promise<Array<string>> {
  const ssm = new SSM({
    apiVersion: '2014-11-06',
    region: 'us-west-2',
  });

  let moreData = true;
  let data = await ssm.getParametersByPath({
    Path: '/aws/service/global-infrastructure/services/lambda/regions',
  }).promise();

  const regions: Array<string> = []
  while(moreData) {
    if (data.$response.error) {
      throw data.$response.error;
    }
    if (!data.Parameters) {
      throw new Error('Failed to get regions from SSM');
    }

    const parameters = data.Parameters;
    for (const parameter of parameters) {
      if (!parameter.Value) {
        console.error(`No value found for ${parameter}`);
        continue;
      }
      if (isValidRegion(parameter.Value)) {
        regions.push(parameter.Value);
      } else {
        console.log(`Skipping ${parameter.Value}`)
      }
    }

    if (data.NextToken) {
      data = await ssm.getParametersByPath({
        Path: '/aws/service/global-infrastructure/services/lambda/regions',
        NextToken: data.NextToken,
      }).promise();
    } else {
      moreData = false;
    }
  }

  return regions;
}