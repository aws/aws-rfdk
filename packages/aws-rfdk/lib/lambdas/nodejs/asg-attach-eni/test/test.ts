/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  AutoScalingClient,
  CompleteLifecycleActionCommand,
} from '@aws-sdk/client-auto-scaling';
import {
  EC2Client,
  AttachNetworkInterfaceCommand,
} from '@aws-sdk/client-ec2';

import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { handler } from '../index';

const ec2Mock = mockClient(EC2Client);
const autoScalingMock = mockClient(AutoScalingClient);

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn( () => {} );
  console.error = jest.fn( () => {} );
});

afterEach(() => {
  ec2Mock.reset();
  autoScalingMock.reset();
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

test('ignores test notification', async () => {
  // GIVEN
  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            Event: 'autoscaling:TEST_NOTIFICATION',
          }),
        },
      },
    ],
  };
  ec2Mock.on(AttachNetworkInterfaceCommand).resolves({});
  autoScalingMock.on(CompleteLifecycleActionCommand).resolves({});

  // WHEN
  await handler(event);

  // THEN
  expect(ec2Mock).not.toHaveReceivedAnyCommand();
  expect(autoScalingMock).not.toHaveReceivedAnyCommand();
});

test('processes all correct records', async () => {
  // GIVEN
  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-2',
            LifecycleHookName: 'Hook-Name-2',
            EC2InstanceId: 'i-1111111111',
            LifecycleActionToken: 'Action-Token-2',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-1111111111',
            }),
          }),
        },
      },
    ],
  };
  ec2Mock.on(AttachNetworkInterfaceCommand).resolves({});
  autoScalingMock.on(CompleteLifecycleActionCommand).resolves({});

  // WHEN
  await handler(event);

  // THEN
  expect(ec2Mock).toHaveReceivedCommandTimes(AttachNetworkInterfaceCommand, 2);
  expect(autoScalingMock).toHaveReceivedCommandTimes(CompleteLifecycleActionCommand, 2);
  expect(ec2Mock).toHaveReceivedNthCommandWith(1, AttachNetworkInterfaceCommand, {
    DeviceIndex: 1,
    InstanceId: 'i-0000000000',
    NetworkInterfaceId: 'eni-000000000',
  });
  expect(ec2Mock).toHaveReceivedNthCommandWith(2, AttachNetworkInterfaceCommand, {
    DeviceIndex: 1,
    InstanceId: 'i-1111111111',
    NetworkInterfaceId: 'eni-1111111111',
  });
  expect(autoScalingMock).toHaveReceivedNthCommandWith(1, CompleteLifecycleActionCommand, {
    AutoScalingGroupName: 'ASG-Name-1',
    LifecycleHookName: 'Hook-Name-1',
    InstanceId: 'i-0000000000',
    LifecycleActionToken: 'Action-Token-1',
    LifecycleActionResult: 'CONTINUE',
  });
  expect(autoScalingMock).toHaveReceivedNthCommandWith(2, CompleteLifecycleActionCommand, {
    AutoScalingGroupName: 'ASG-Name-2',
    LifecycleHookName: 'Hook-Name-2',
    InstanceId: 'i-1111111111',
    LifecycleActionToken: 'Action-Token-2',
    LifecycleActionResult: 'CONTINUE',
  });
});

test('abandons launch when attach fails', async () => {
  // GIVEN
  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
    ],
  };

  ec2Mock.on(AttachNetworkInterfaceCommand).rejects({});
  autoScalingMock.on(CompleteLifecycleActionCommand).resolves({});

  // WHEN
  await handler(event);

  // THEN
  expect(autoScalingMock).toHaveReceivedCommandTimes(CompleteLifecycleActionCommand, 1);
  expect(autoScalingMock).toHaveReceivedNthCommandWith(1, CompleteLifecycleActionCommand, {
    AutoScalingGroupName: 'ASG-Name-1',
    LifecycleHookName: 'Hook-Name-1',
    InstanceId: 'i-0000000000',
    LifecycleActionToken: 'Action-Token-1',
    LifecycleActionResult: 'ABANDON',
  });
});

test('continues when complete lifecycle errors', async () => {
  // GIVEN
  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
    ],
  };

  ec2Mock.on(AttachNetworkInterfaceCommand).resolves({});
  autoScalingMock.on(CompleteLifecycleActionCommand).rejects({});

  // THEN
  // eslint-disable-next-line: no-floating-promises
  await expect(handler(event)).resolves.not.toThrow();
  expect(console.error).toHaveBeenCalledTimes(4); // 4 = each of the two records printing two error messages
});

test('continues when complete lifecycle errors non-error thrown', async () => {
  // GIVEN
  const event = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
      {
        Sns: {
          Message: JSON.stringify({
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            AutoScalingGroupName: 'ASG-Name-1',
            LifecycleHookName: 'Hook-Name-1',
            EC2InstanceId: 'i-0000000000',
            LifecycleActionToken: 'Action-Token-1',
            NotificationMetadata: JSON.stringify({
              eniId: 'eni-000000000',
            }),
          }),
        },
      },
    ],
  };

  ec2Mock.on(AttachNetworkInterfaceCommand).resolves({});

  jest.spyOn(JSON, 'parse').mockImplementation(jest.fn( () => {throw 47;} ));

  // THEN
  // eslint-disable-next-line: no-floating-promises
  await expect(handler(event)).resolves.not.toThrow();
  expect(console.error).toHaveBeenCalledTimes(2); // 2 = each of the two records printing one error message.
});
