/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnElement, Stack } from 'aws-cdk-lib';
import {
  Template,
} from 'aws-cdk-lib/assertions';
import {
  AutoScalingGroup,
} from 'aws-cdk-lib/aws-autoscaling';
import {
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';

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

  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
  });
});

test('Grant SSM permissions to ASG', () => {
  const asg = new AutoScalingGroup(stack, 'ASG', {
    vpc,
    instanceType,
    machineImage,
  });
  SessionManagerHelper.grantPermissionsTo(asg);

  const asgRole = stack.getLogicalId(asg.role.node.defaultChild as CfnElement);

  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
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
  });
});
