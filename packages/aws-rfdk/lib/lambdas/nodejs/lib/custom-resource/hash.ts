/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, Hash } from 'crypto';

export function calculateSha256Hash(value: any): string {
  // eslint-disable-next-line no-shadow
  function _updateHashWithValue(hash: Hash, val: any) {
    if (Array.isArray(val)) {
      for (const item of val) {
        _updateHashWithValue(hash, item);
      }
    } else if (typeof val === 'object') {
      for (const [key, item] of Object.entries(val).sort()) {
        hash.update(key);
        _updateHashWithValue(hash, item);
      }
    } else if (typeof val === 'number') {
      hash.update(val.toString());
    } else if (typeof val === 'string') {
      hash.update(val);
    } else {
      throw new Error(`Unexpected value type: ${typeof(val)}`);
    }
  }

  const hash: Hash = createHash('sha256');
  _updateHashWithValue(hash, value);
  return hash.digest().toString('hex');
}
