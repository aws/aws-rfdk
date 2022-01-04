/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CfnResource,
  Construct,
  IResource,
  RemovalPolicy,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';

/**
 * Represents a resource in RFDK.
 */
export abstract class Resource extends Construct implements IResource {
  /**
   * @inheritdoc
   */
  public abstract readonly stack: Stack;

  /**
   * @inheritdoc
   */
  public abstract readonly env: ResourceEnvironment;

  /**
   * This is the same implementation as CDK's from here:
   * https://github.com/aws/aws-cdk/blob/cd51a5dae1780e34aecd90d85783fb6d3c239903/packages/@aws-cdk/core/lib/resource.ts
   *
   * We don't want to extend our classes from their implementation directly due
   * to how the CDK Resource is meant to map to L1 constructs.
   *
   * Apply the given removal policy to this resource
   *
   * The Removal Policy controls what happens to this resource when it stops
   * being managed by CloudFormation, either because you've removed it from the
   * CDK application or because you've made a change that requires the resource
   * to be replaced.
   *
   * The resource can be deleted (`RemovalPolicy.DESTROY`), or left in your AWS
   * account for data recovery and cleanup later (`RemovalPolicy.RETAIN`).
   */
  public applyRemovalPolicy(policy: RemovalPolicy) {
    const child = this.node.defaultChild;
    if (!child || !CfnResource.isCfnResource(child)) {
      throw new Error('Cannot apply RemovalPolicy: no child or not a CfnResource. Apply the removal policy on the CfnResource directly.');
    }
    child.applyRemovalPolicy(policy);
  }
}
