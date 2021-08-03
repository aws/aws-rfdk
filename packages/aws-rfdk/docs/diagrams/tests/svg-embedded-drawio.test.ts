/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

/**
 * This is the regular expression that validates that the draw.io diagram is embedded within the SVG file.
 *
 * draw.io embeds the diagram as a "content" XML attribute of the <svg> element. This looks like:
 *
 * <svg ... content="...embedded SVG diagram...">
 *   ...
 * </svg>
 *
 * When you choose to not include a copy of the draw.io diagram, this attribute is not written to the file.
 *
 * This is a very simple regular expression that will match the opening <svg> tag and ensure it has a non-empty
 * XML attribute named "content". While this validation doesn't assert the validity of the content attribute,
 * it will catch the common mistake of forgetting to include an embedded copy of the draw.io diagram.
 */
const DRAW_IO_EMBEDDED_XML_ATTR_REGEX = /<svg( [^>]+)?content="[^"]+?"[^>]*?>/;
const DIAGRAM_ROOT = path.join(__dirname, '..');

/**
 * Returns all `.svg` files that are descendants of the `packages/aws-rfdk/docs/diagrams` directory.
 */
function findSvgDiagrams(dirPath?: string): string[] {
  if (!dirPath) {
    dirPath = DIAGRAM_ROOT;
  }

  let diagrams: string[] = [];

  const listings = fs.readdirSync(dirPath);

  for (const listing of listings) {
    const listingPath = path.join(dirPath, listing);
    const stat = fs.statSync(listingPath);
    if (stat.isDirectory()) {
      const dirDiagrams = findSvgDiagrams(listingPath);
      diagrams = diagrams.concat(...dirDiagrams);
    }
    else if (path.extname(listing).toLowerCase() === '.svg') {
      diagrams.push(listingPath);
    }
  }

  return diagrams;
}

describe('diagrams', () => {
  const diagrams = findSvgDiagrams();

  describe('have draw.io diagrams embedded', () => {

    diagrams.forEach(diagram => {
      const relativeDiagramPath = path.relative(DIAGRAM_ROOT, diagram);

      // We use string interpolation below, otherwise eslint incorrectly believes that the test name is not a valid
      // string
      test(`${relativeDiagramPath}`, async () => {
        // GIVEN
        const diagramContents = await fsPromises.readFile(diagram, { encoding: 'utf8' });

        // THEN
        expect(diagramContents).toMatch(DRAW_IO_EMBEDDED_XML_ATTR_REGEX);
      });
    });

  });
});
