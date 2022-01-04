/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResourceLike,
  ResourcePart,
} from '@aws-cdk/assert';
import { CfnResource, Construct, IResource, RemovalPolicy, ResourceEnvironment, Stack } from '@aws-cdk/core';

import { Resource } from '../lib';

test('applyRemovalPolicy available for interface resources', () => {
  class Subject extends Resource {
    public readonly stack: Stack;
    public readonly env: ResourceEnvironment;

    constructor(scope: Construct, id: string) {
      super(scope, id);
      this.stack = Stack.of(scope);
      this.env = {
        account: this.stack.account,
        region: this.stack.region,
      };

      new CfnResource(this, 'Resource', {
        type: 'ChildResourceType',
      });
    }
  }

  const stack = new Stack();
  const subject: IResource = new Subject(stack, 'Subject');

  subject.applyRemovalPolicy(RemovalPolicy.RETAIN);

  expectCDK(stack).to(haveResourceLike('ChildResourceType', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  }, ResourcePart.CompleteDefinition));
});