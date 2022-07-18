/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';


// CDKv2's assertion module doesn't have a Template.resourcePropertiesCountIs that would count
// the number of resources with the given properties. We add that here.
export function resourcePropertiesCountIs(stack: Stack, type: string, props: any, count: number): void {
  const resources = Template.fromStack(stack).findResources(type, Match.objectLike({ Properties: props }));
  expect(Object.keys(resources)).toHaveLength(count);
}