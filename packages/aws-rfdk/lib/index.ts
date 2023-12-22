/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './core';
export * as deadline from './deadline';

// Emit a warning for NodeJS versions earlier than 18.x
const version = process.versions.node.split('.').map(parseInt);
if (version[0] < 18) {
  process.emitWarning(`RFDK officially supports NodeJS 18 or greater, but got ${process.versions.node}`);
}
