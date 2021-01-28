#!/usr/bin/env node
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import { config } from './config';
import * as cdk from '@aws-cdk/core';
import { NetworkTier } from '../lib/network-tier';
import {
  ServiceTier,
} from '../lib/service-tier';
import {
  StorageTier,
  StorageTierDocDB,
  StorageTierMongoDB,
} from '../lib/storage-tier';
import { SecurityTier } from '../lib/security-tier';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
} from '@aws-cdk/aws-ec2';
import { ComputeTier } from '../lib/compute-tier';

  // ------------------------------ //
  // --- Validate Config Values --- //
  // ------------------------------ //

  if (!config.ublCertificatesSecretArn && config.ublLicenses) {
    throw new Error('UBL certificates secret ARN is required when using UBL but was not specified.');
  }

  if (!config.ublLicenses) {
    console.warn('No UBL licenses specified. UsageBasedLicensing will be skipped.');
  }

  if (!config.keyPairName) {
    console.log('EC2 key pair name not specified. You will not have SSH access to the render farm.');
  }

  if (config.deadlineClientLinuxAmiMap === {['region']: 'ami-id'}) {
    throw new Error('Deadline Client Linux AMI map is required but was not specified.');
  }

// ------------------- //
// --- Application --- //
// ------------------- //

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

// -------------------- //
// --- Network Tier --- //
// -------------------- //

const network = new NetworkTier(app, 'NetworkTier', { env });

// --------------------- //
// --- Security Tier --- //
// --------------------- //

const security = new SecurityTier(app, 'SecurityTier', { env });

// -------------------- //
// --- Storage Tier --- //
// -------------------- //

let storage: StorageTier;
if (config.deployMongoDB) {
  storage = new StorageTierMongoDB(app, 'StorageTier', {
    env,
    vpc: network.vpc,
    databaseInstanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
    rootCa: security.rootCa,
    dnsZone: network.dnsZone,
    acceptSsplLicense: config.acceptSsplLicense,
    keyPairName: config.keyPairName ? config.keyPairName : undefined,
  });
} else {
  storage = new StorageTierDocDB(app, 'StorageTier', {
    env,
    vpc: network.vpc,
    databaseInstanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
  });
}

// -------------------- //
// --- Service Tier --- //
// -------------------- //

const service = new ServiceTier(app, 'ServiceTier', {
  env,
  database: storage.database,
  fileSystem: storage.fileSystem,
  vpc: network.vpc,
  deadlineVersion: config.deadlineVersion,
  ublCertsSecretArn: config.ublCertificatesSecretArn,
  ublLicenses: config.ublLicenses,
  rootCa: security.rootCa,
  dnsZone: network.dnsZone,
  acceptAwsThinkboxEula: config.acceptAwsThinkboxEula,
});

// -------------------- //
// --- Compute Tier --- //
// -------------------- //

new ComputeTier(app, 'ComputeTier', {
  env,
  vpc: network.vpc,
  renderQueue: service.renderQueue,
  workerMachineImage: MachineImage.genericLinux(config.deadlineClientLinuxAmiMap),
  keyPairName: config.keyPairName ? config.keyPairName : undefined,
  usageBasedLicensing: service.ublLicensing,
  licenses: config.ublLicenses,
});
