/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk';

export async function getMostRecentVersion(lambda: Lambda, layerName: string): Promise<Lambda.LayerVersionsListItem | undefined> {
  const layerVersionsResult = await lambda.listLayerVersions({ LayerName: layerName }).promise();
  if (layerVersionsResult.$response.error) {
    throw layerVersionsResult.$response.error;
  }
  return layerVersionsResult.LayerVersions?.shift();
}
