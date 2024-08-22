/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LambdaClient,
  ListLayerVersionsCommand,
  LayerVersionsListItem,
} from '@aws-sdk/client-lambda';

export async function getMostRecentVersion(lambda: LambdaClient, layerName: string): Promise<LayerVersionsListItem | undefined> {
  const layerVersionsResult = await lambda.send(new ListLayerVersionsCommand({ LayerName: layerName }));
  return layerVersionsResult.LayerVersions?.shift();
}
