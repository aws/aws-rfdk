/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The allocation strategy for the Spot Instances in your Spot Fleet
 * determines how it fulfills your Spot Fleet request from the possible
 * Spot Instance pools represented by its launch specifications.
 * See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-fleet-configuration-strategies.html#ec2-fleet-allocation-strategy
 */
export enum SpotFleetAllocationStrategy {
  /**
   * Spot Fleet launches instances from the Spot Instance pools with the lowest price.
   */
  LOWEST_PRICE = 'lowestPrice',
  /**
   * Spot Fleet launches instances from all the Spot Instance pools that you specify.
   */
  DIVERSIFIED = 'diversified',
  /**
   * Spot Fleet launches instances from Spot Instance pools with optimal capacity for the number of instances that are launching.
   */
  CAPACITY_OPTIMIZED = 'capacityOptimized',
}

/**
 * Resource types that presently support tag on create.
 */
export enum SpotFleetResourceType {
  /**
   * EC2 Instances.
   */
  INSTANCE = 'instance',

  /**
   * Spot fleet requests.
   */
  SPOT_FLEET_REQUEST = 'spot-fleet-request',
}

/**
 * The type of request. Indicates whether the Spot Fleet only requests the target capacity or also attempts to maintain it.
 * Only 'maintain' is currently supported.
 */
export enum SpotFleetRequestType {
  /**
   * The Spot Fleet maintains the target capacity.
   * The Spot Fleet places the required requests to meet capacity and automatically replenishes any interrupted instances.
   */
  MAINTAIN = 'maintain',
}
