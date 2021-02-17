/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

const DEFAULT_ENCODING = 'utf8';
const VALID_NAMES = /^[a-z][a-z0-9_]+$/i;

/**
 * Properties for invoking the template function
 */
export interface TemplateProps {
  /**
   * Path to the template file
   */
  readonly templatePath: string;

  /**
   * Mapping of token names to their substituted values.
   * Valid tokens are of the form `/^[a-z][a-z0-9_]+$/i`. Such as:
   * ```
   * ${NAME}
   * ```
   */
  readonly tokens: { [name: string]: string };

  /**
   * An optional encoding for the template file.
   *
   * @default "utf8"
   */
  readonly encoding?: BufferEncoding;
}

/**
 * Simple templating function. Loads a template from a path and substitutes all
 * occurrences of the tokens with their values.
 *
 * @param props The properties required to create the template
 * @returns The substituted template contents as a string
 */
export function templateComponent(props: TemplateProps): string {
  if (!props.templatePath.endsWith('.component.template')) {
    throw new Error(`Path does not end with ".component.template" ("${props.templatePath}")`);
  }

  const { templatePath, tokens } = props;
  const encoding = props.encoding ?? DEFAULT_ENCODING;

  Object.keys(tokens).forEach(name => {
    if (!VALID_NAMES.test(name)) {
      throw new Error(`Invalid token name "${name}"`);
    }
  });

  // Load the template from disk
  let result = fs.readFileSync(templatePath, { encoding });

  // Replace the tokens
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\\${${key}}`, 'g'), value);
  }

  return result;
}
