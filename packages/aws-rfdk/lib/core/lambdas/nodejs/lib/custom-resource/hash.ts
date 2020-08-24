/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, Hash } from 'crypto';

export function calculateSha256Hash(value: any): string {
  // eslint-disable-next-line no-shadow
  function _updateHashWithValue(hash: Hash, value: any) {
    if (Array.isArray(value)) {
      for (const item of value) {
        _updateHashWithValue(hash, item);
      }
    } else if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value).sort()) {
        hash.update(key);
        _updateHashWithValue(hash, item);
      }
    } else if (typeof value === 'number') {
      hash.update(value.toString());
    } else if (typeof value === 'string') {
      hash.update(value);
    } else {
      throw new Error(`Unexpected value type: ${typeof(value)}`);
    }
  }

  const hash: Hash = createHash('sha256');
  _updateHashWithValue(hash, value);
  return hash.digest().toString('hex');
}
