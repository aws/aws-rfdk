/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  countResourcesLike,
  expect as expectCDK,
} from '@aws-cdk/assert';
import {
  Stack,
} from '@aws-cdk/core';

/**
 * The name of the tag that RFDK is expected to use
 */
const RFDK_TAG_NAME = 'aws-rfdk';

/**
 * The current version of the RFDK package
 */
const RFDK_VERSION = require('../../../package.json').version as string; // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Returns the resource properties for an expected RFDK tag for a given resource
 * type
 *
 * @param resourceType The L1 CloudFormation resource type (e.g. "AWS::EC2::Instance")
 * @param constructName The name of the L2 (or higher) RFDK construct class
 */
function getExpectedRfdkTagProperties(resourceType: string, constructName: string) {
  const expectedValue = `${RFDK_VERSION}:${constructName}`;
  if (resourceType === 'AWS::SSM::Parameter') {
    return {
      Tags: {
        [RFDK_TAG_NAME]: expectedValue,
      },
    };
  } else if (resourceType === 'AWS::AutoScaling::AutoScalingGroup') {
    return {
      Tags: arrayWith({
        Key: RFDK_TAG_NAME,
        PropagateAtLaunch: true,
        Value: expectedValue,
      }),
    };
  } else {
    return {
      Tags: arrayWith({
        Key: RFDK_TAG_NAME,
        Value: expectedValue,
      }),
    };
  }
}

/**
 * Arguments for the {@link testConstructTags} function
 */
interface TestConstructTagsArgs {
  /**
   * The class name of the construct that should be tested for tagging RFDK meta-data.
   */
  readonly constructName: string;

  /**
   * A callback function called to create an instance of the construct being tested in its own isolated stack.
   * The isolated stack should be returned by the callback function.
   */
  readonly createConstruct: () => Stack;

  /**
   * A mapping of CloudFormation resource types to counts of the number of expected resources that should be tagged
   * with RFDK meta-data.
   *
   * E.g.
   *
   * ```ts
   * {
   *   'AWS::AutoScaling::AutoScalingGroup': 1,
   *   'AWS::EC2::SecurityGroup': 3,
   * }
   * ```
   */
  readonly resourceTypeCounts: {[resourceType: string]: number};
}

/**
 * Creates tests for the specified resources created by a L2 (or higher construct) to ensure that the resources it
 * creates are created with the RFDK tagging convention.
 *
 * The convention is to create a tag named "aws-rfdk" whose value follows:
 *
 * <VERSION>:<CONSTRUCT_NAME>
 *
 * @param args Arguments to configure the creation of construct tagging tests
 */
export function testConstructTags(args: TestConstructTagsArgs) {
  const { constructName, createConstruct, resourceTypeCounts } = args;
  const entries = Object.entries(resourceTypeCounts);

  test.each(entries)('tags %s x%d', (resourceType: string, expectedCount: number) => {
    // GIVEN
    const expectedProps = getExpectedRfdkTagProperties(resourceType, constructName);

    // WHEN
    const stack = createConstruct();

    // THEN
    expectCDK(stack).to(countResourcesLike(resourceType, expectedCount, expectedProps));
  });
}