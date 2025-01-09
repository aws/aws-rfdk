/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
  SSMClient,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';

// Regions introduced before March 20, 2019 are enabled by default, so we maintain this
// allowlist to only publish to these regions since we can gurantee the account uses them.
// See https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html
const REGION_ALLOW_LIST = [
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-north-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2'
];

function isValidRegion(region: string): boolean {
  return (
    REGION_ALLOW_LIST.includes(region)
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
