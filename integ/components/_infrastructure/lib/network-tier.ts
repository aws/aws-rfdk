/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SubnetConfiguration,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Stack,
  StackProps,
} from '@aws-cdk/core';

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
      subnetType: SubnetType.PRIVATE,
      cidrMask: 28,
    },
    renderQueueAlb: {
      name: 'RenderQueueAlbSubnets',
      subnetType: SubnetType.PRIVATE,
      // Current RenderQueueStructs:
      //   deadline_02_renderQueue: 2
      //   deadline_03_workerFleetHttp: 2
      //   deadline_04_workerFleetHttps: 2
      //   deadline_05_secretsManagement: 1
      // 7 total
      // If we choose a CIDR mask of 25, we get 2^(32-25)-2 = 126 IP addresses
      // 126/7 = 18 IP addresses per RenderQueue
      // Recommended addresses is 30 per subnet with a minimum of 8, so /25 gives us a little room before we hit the minimum. Refer to:
      // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer
      cidrMask: 25, // 2^(32-25)-2 = 126 IP addresses
    },
    sepFleet: {
      name: 'SepFleetSubnets',
      subnetType: SubnetType.PRIVATE,
    },
    ubl: {
      name: 'UblSubnets',
      subnetType: SubnetType.PRIVATE,
    },
    workerInstanceFleet: {
      name: 'WorkerInstanceFleetSubnets',
      subnetType: SubnetType.PRIVATE,
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
