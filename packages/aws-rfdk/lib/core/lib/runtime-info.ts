/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  Construct,
  Tags,
} from '@aws-cdk/core';

/**
 * The name of the tag used to associate the RFDK version and construct that deploys a given resources.
 */
const TAG_NAME = 'aws-rfdk';

interface TagFields {
  /**
   * The name of the tag
   */
  readonly name: string;

  /**
   * The value of the tag
   */
  readonly value: string;
}

/**
 * Returns the fields to be used for tagging AWS resources for a given construct
 *
 * @param scope The construct instance whose underlying resources should be tagged
 */
export function tagFields<T extends Construct>(scope: T): TagFields {
  const className = scope.constructor.name;
  return {
    name: TAG_NAME,
    value: `${RFDK_VERSION}:${className}`,
  };
}

/**
 * Function that reads in the version of RFDK from the `package.json` file.
 */
function getVersion(): string {
  return require(path.join(__dirname, '..', '..', '..', 'package.json')).version as string; // eslint-disable-line @typescript-eslint/no-require-imports
}

/**
 * The RFDK version string as listed in `package.json`
 */
export const RFDK_VERSION = getVersion();

/**
 * Tags all resources deployed by a construct with the RFDK version and the construct name separated by a colon (":")
 * delimiter.
 *
 * @param scope A construct instance to tag
 */
export function tagConstruct<T extends Construct>(scope: T) {
  const fields = tagFields(scope);
  Tags.of(scope).add(fields.name, fields.value);
}
