/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
  SSMClient,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';

// These regions need to be enabled for the AWS account being used for publishing, so we skip them
// See https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html
const REGION_DENY_LIST = [
  'af-south-1',
  'ap-east-1',
  'ap-south-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ca-west-1',
  'eu-south-1',
  'eu-south-2',
  'eu-central-2',
  'il-central-1',
  'me-south-1',
  'me-central-1',
];

function isValidRegion(region: string): boolean {
  return (
    !REGION_DENY_LIST.includes(region)
    && !region.startsWith('cn-')
    && !region.startsWith('us-gov-')
  );
}

export async function getRegions(): Promise<Array<string>> {
  const ssm = new SSMClient({
    region: 'us-west-2',
  });

  let moreData = true;
  let data = await ssm.send(new GetParametersByPathCommand({
    Path: '/aws/service/global-infrastructure/services/lambda/regions',
  }));

  const regions: Array<string> = []
  while(moreData) {
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
      data = await ssm.send(new GetParametersByPathCommand({
        Path: '/aws/service/global-infrastructure/services/lambda/regions',
        NextToken: data.NextToken,
      }));
    } else {
      moreData = false;
    }
  }

  return regions;
}
