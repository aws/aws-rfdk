#!/usr/bin/env node

/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {IInstallerVersion, VersionProvider} from '../lib/core/lambdas/nodejs/version-provider';

async function parseInstaller(installerVersion: IInstallerVersion): Promise<void> {
  /* eslint-disable no-console */
  console.log('Installer', installerVersion.Installers.clientInstaller);
}

function getInstaller(): void {
  const handler = new VersionProvider('./index-test.json');
  handler.doCreate('physicalId', { platform: 'linux', product: 'Deadline'}).then(parseInstaller).catch(error => {
    console.log('ERROR:', error.message);
  });
}

getInstaller();
