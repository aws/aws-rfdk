#!/usr/bin/env node
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import {
  MachineImage,
} from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';

import { config } from './config';
import { ComputeTier } from '../lib/compute-tier';
import { NetworkTier } from '../lib/network-tier';
import { SecurityTier } from '../lib/security-tier';
import { ServiceTier } from '../lib/service-tier';

  // ------------------------------ //
  // --- Validate Config Values --- //
  // ------------------------------ //
  if (!config.keyPairName) {
    console.log('EC2 key pair name not specified. You will not have SSH access to the render farm.');
  }

// ------------------- //
// --- Application --- //
// ------------------- //

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const network = new NetworkTier(app, 'NetworkTier', { env });

const security = new SecurityTier(app, 'SecurityTier', { env });

const service = new ServiceTier(app, 'ServiceTier', {
  env,
  vpc: network.vpc,
  availabilityZones: config.availabilityZonesStandard,
  deadlineVersion: config.deadlineVersion,
  rootCa: security.rootCa,
  dnsZone: network.dnsZone,
  userAwsCustomerAgreementAndIpLicenseAcceptance: config.acceptAwsCustomerAgreementAndIpLicense,
});

new ComputeTier(app, 'ComputeTier', {
  env,
  vpc: network.vpc,
  availabilityZones: config.availabilityZonesLocal,
  renderQueue: service.renderQueue,
  workerMachineImage: MachineImage.genericLinux(config.deadlineClientLinuxAmiMap),
  keyPairName: config.keyPairName,
});
