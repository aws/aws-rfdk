/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import {
  SubnetConfiguration,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkTierSubnetConfiguration {
  readonly testRunner: SubnetConfiguration;
  readonly renderQueueAlb: SubnetConfiguration;
  readonly sepFleet: SubnetConfiguration;
  readonly ubl: SubnetConfiguration;
  readonly workerInstanceFleet: SubnetConfiguration;
}

export class NetworkTier extends Stack {
  public static readonly subnetConfig: NetworkTierSubnetConfiguration = {
    testRunner: {
      name: 'TestRunnerSubnets',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      cidrMask: 26, // 2^(32-26)-2 = 62 IP addresses
    },
    renderQueueAlb: {
      name: 'RenderQueueAlbSubnets',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      // Current RenderQueueStructs:
      //   deadline_02_renderQueue: 2
      //   deadline_03_workerFleetHttp: 2
      //   deadline_04_workerFleetHttps: 2
      //   deadline_05_secretsManagement: 1
      // 7 total
      // If we choose a CIDR mask of 25, we get 2^(32-25)-2 = 126 IP addresses
      // 126/7 = 18 IP addresses per RenderQueue
      // Recommended addresses is 30 per subnet with a minimum of 8, so a /25 would give us us a little room before
      // we hit the maximum. No reason to shave it so thin, though, so we'll give ourselves 8x that.
      // Refer to:
      // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer
      cidrMask: 22, // 2^(32-22)-2 = 1022 IP addresses
    },
    sepFleet: {
      name: 'SepFleetSubnets',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    },
    ubl: {
      name: 'UblSubnets',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    },
    workerInstanceFleet: {
      name: 'WorkerInstanceFleetSubnets',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    },
  };

  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Workaround: the maxAZs are limited to prevent exceeding account limits on subaddresses
    this.vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        ...Object.values(NetworkTier.subnetConfig),
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });
  }
}
