/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function escapeTokenRegex(s: string): string {
  // A CDK Token looks like: ${Token[TOKEN.12]}
  // This contains the regex special characters: ., $, {, }, [, and ]
  // Escape those for use in a regex.
  return s.replace(/[.${}[\]]/g, '\\$&');
}
