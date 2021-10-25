/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubnetConfiguration, SubnetType } from '@aws-cdk/aws-ec2';

export class Subnets {
  /**
   * Subnets for undistinguished render farm back-end infrastructure
   */
   public static readonly INFRASTRUCTURE: SubnetConfiguration = {
    name: 'Infrastructure',
    subnetType: SubnetType.PRIVATE,
    // 1,022 IP addresses
    cidrMask: 22,
  };

  /**
   * Subnets for publicly accessible infrastructure
   */
  public static readonly PUBLIC: SubnetConfiguration = {
    name: 'Public',
    subnetType: SubnetType.PUBLIC,
    // 14 IP addresses. We only require one ENI per internet gateway per AZ, but leave some extra room
    // should there be a need for externally accessible ENIs
    cidrMask: 28,
  };

  /**
   * Subnets for the Render Queue Application Load Balancer (ALB).
   *
   * It is considered good practice to put a load blanacer in dedicated subnets. Additionally, the subnets must have a
   * CIDR block with a bitmask of at least /27 and at least 8 free IP addresses per subnet. ALBs can scale up to a
   * maximum of 100 IP addresses distributed across all subnets. Assuming only 2 AZs (the minimum) we should have 50 IPs
   * per subnet = CIDR mask of /26
   *
   * See:
   * - https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer
   * - https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/lib/deadline/README.md#render-queue-subnet-placement
   */
  public static readonly RENDER_QUEUE_ALB: SubnetConfiguration = {
    name: 'RenderQueueALB',
    subnetType: SubnetType.PRIVATE,
    // 62 IP addresses
    cidrMask: 26,
  };

  /**
   * Subnets for the Usage-Based Licensing
   */
  public static readonly USAGE_BASED_LICENSING: SubnetConfiguration = {
    name: 'UsageBasedLicensing',
    subnetType: SubnetType.PRIVATE,
    // 14 IP addresses
    cidrMask: 28,
  };

  /**
   * Subnets for the Worker instances
   */
  public static readonly WORKERS: SubnetConfiguration = {
    name: 'Workers',
    subnetType: SubnetType.PRIVATE,
    // 4,094 IP addresses
    cidrMask: 20,
  };
}
