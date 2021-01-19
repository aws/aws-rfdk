/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

/* eslint-disable no-console */

import { DeadlineClient } from '../deadline-client';

test('basic test', () => {
  new DeadlineClient({
    host: 'YWG-1800514339.ant.amazon.com',
    port: 8080,
    // tls: {
    //   pfxPath: 'Deadline10RemoteClient.pfx',
    //   passphrase: 'qwerty123',
    //   caPath: 'ca.crt',
    // }
  });

  // // minimumVersion(deadlineClient);
  // // jobState(deadlineClient);
  // spotFleetRequestConfiguration(deadlineClient);
  // spotFleetRequestGroupPools(deadlineClient);
});