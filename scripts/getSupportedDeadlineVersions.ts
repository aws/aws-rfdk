#!/usr/bin/env node
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Get the minimum supported version by pulling it from the Version class in
// RFDK's Deadline submodule.

const dlmod = require('../packages/aws-rfdk/lib/deadline');
const minVersion = dlmod.Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString();

// Get the maximum supported version by querying the Deadline metadata file that is
// hosted in S3.
// Officially, the RFDK supports the latest version of Deadline that had been released
// when the RFDK version releases.
const mod = require('../packages/aws-rfdk/lib/core/lambdas/nodejs/lib/version-provider');
const provider=new mod.VersionProvider();

provider.getVersionUris({ product: mod.Product.deadline, platform: mod.Platform.linux })
  .then(result => {
    const version = result.get(mod.Platform.linux);
    const maxVersion = `${version.MajorVersion}.${version.MinorVersion}.${version.ReleaseVersion}.${version.PatchVersion}`;
    console.log(`Min: ${minVersion}\nMax: ${maxVersion}`);
  })
  .catch(error => {
    console.error(`ERROR - ${error.message}`);
    process.exit(1);
  });
