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
 * occurrences of the tokens with their values. Tokens are of the form
 *
 * ```
 * ${NAME}
 * ```
 *
 * Valid token names are of the form `/^[a-z][a-z0-9_]+$/i`.
 *
 * @param path Path to the template file
 * @param tokens A mapping of token names to the values that should be substituted
 * @param encoding An optional encoding (default is "utf8")
 * @returns The substituted template contents
 */
export function template(props: TemplateProps) {
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

/**
 * Generates an EC2 Image Builder component document from a template file.
 *
 * The input path is expected to end with ".component.template". The output path
 * will be in the cdk.out directory as the input path, with the
 * ".component.template" suffix removed and a specified suffix appended instead.
 *
 * @param props Properties for generating an EC2 ImageBuilder component document
 * @returns The generated component document's file path
 */
export function templateComponent(props: TemplateProps) {
  const encoding = props.encoding ?? DEFAULT_ENCODING;

  if (!props.templatePath.endsWith('.component.template')) {
    throw new Error(`Path does not end with ".component.template" ("${props.templatePath}")`);
  }

  const outputPath = props.templatePath.replace(/\.template$/, '');

  const contents = template(props);

  fs.writeFileSync(outputPath, contents, encoding);

  return outputPath;
}
