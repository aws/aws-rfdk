/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  AutoScalingGroup,
} from '@aws-cdk/aws-autoscaling';
import {
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import { CfnElement, Stack } from '@aws-cdk/core';

import { SessionManagerHelper } from '../lib';

let stack: Stack;
let vpc: Vpc;
const instanceType = InstanceType.of(InstanceClass.T3, InstanceSize.MICRO);
const machineImage = new AmazonLinuxImage();

beforeEach(() => {
  stack = new Stack();
  vpc = new Vpc(stack, 'VPC');
});

test('Grant SSM permissions to Instance', () => {
  const instance = new Instance(stack, 'Instance', {
    vpc,
    instanceType,
    machineImage,
  });
  SessionManagerHelper.grantPermissionsTo(instance);

  const instanceRole = stack.getLogicalId(instance.role.node.defaultChild as CfnElement);

  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:UpdateInstanceInformation',
          ],
          Effect: 'Allow',
          Resource: '*',
        },
      ],
    },
    Roles: [{ Ref: instanceRole }],
  }));
});

test('Grant SSM permissions to ASG', () => {
  const asg = new AutoScalingGroup(stack, 'ASG', {
    vpc,
    instanceType,
    machineImage,
  });
  SessionManagerHelper.grantPermissionsTo(asg);

  const asgRole = stack.getLogicalId(asg.role.node.defaultChild as CfnElement);

  expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:UpdateInstanceInformation',
          ],
          Effect: 'Allow',
          Resource: '*',
        },
      ],
    },
    Roles: [{ Ref: asgRole }],
  }));
});
