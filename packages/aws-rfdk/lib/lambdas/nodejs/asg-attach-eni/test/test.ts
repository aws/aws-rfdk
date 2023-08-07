/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
// import { fake, spy } from 'sinon';

import { handler } from '../index';

let attachSpy: jest.Mock;
let completeSpy: jest.Mock;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

async function successRequestMock(request: { [key: string]: string}): Promise<{ [key: string]: string }> {
  return { ...request };
}

async function errorRequestMock(): Promise<void> {
  const error: AWS.AWSError = new Error('Mock error message') as AWS.AWSError;
  error.code = 'MockRequestException';
  throw error;
}

beforeEach(() => {
  setSDKInstance(AWS);
  console.log = jest.fn( () => {} );
  console.error = jest.fn( () => {} );
});

afterEach(() => {
  restore('EC2');
  restore('AutoScaling');
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
  attachSpy = jest.fn( (request) => successRequestMock(request) );
  completeSpy = jest.fn( (request) => successRequestMock(request) );
  mock('EC2', 'attachNetworkInterface', attachSpy);
  mock('AutoScaling', 'completeLifecycleAction', completeSpy);

  // WHEN
  await handler(event);

  // THEN
  expect(attachSpy).not.toHaveBeenCalled();
  expect(completeSpy).not.toHaveBeenCalled();
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
  attachSpy = jest.fn( (request) => successRequestMock(request) );
  completeSpy = jest.fn( (request) => successRequestMock(request) );
  mock('EC2', 'attachNetworkInterface', attachSpy);
  mock('AutoScaling', 'completeLifecycleAction', completeSpy);

  // WHEN
  await handler(event);

  // THEN
  expect(attachSpy).toHaveBeenCalledTimes(2);
  expect(completeSpy).toHaveBeenCalledTimes(2);
  expect(attachSpy.mock.calls[0][0]).toStrictEqual({
    DeviceIndex: 1,
    InstanceId: 'i-0000000000',
    NetworkInterfaceId: 'eni-000000000',
  });
  expect(attachSpy.mock.calls[1][0]).toStrictEqual({
    DeviceIndex: 1,
    InstanceId: 'i-1111111111',
    NetworkInterfaceId: 'eni-1111111111',
  });
  expect(completeSpy.mock.calls[0][0]).toStrictEqual({
    AutoScalingGroupName: 'ASG-Name-1',
    LifecycleHookName: 'Hook-Name-1',
    InstanceId: 'i-0000000000',
    LifecycleActionToken: 'Action-Token-1',
    LifecycleActionResult: 'CONTINUE',
  });
  expect(completeSpy.mock.calls[1][0]).toStrictEqual({
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

  attachSpy = jest.fn( () => errorRequestMock() );
  completeSpy = jest.fn( (request) => successRequestMock(request) );
  mock('EC2', 'attachNetworkInterface', attachSpy);
  mock('AutoScaling', 'completeLifecycleAction', completeSpy);

  // WHEN
  await handler(event);

  // THEN
  expect(completeSpy.mock.calls[0][0]).toStrictEqual({
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

  attachSpy = jest.fn( (request) => successRequestMock(request) );
  completeSpy = jest.fn( () => errorRequestMock() );
  mock('EC2', 'attachNetworkInterface', attachSpy);
  mock('AutoScaling', 'completeLifecycleAction', completeSpy);

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

  attachSpy = jest.fn( (request) => successRequestMock(request) );
  mock('EC2', 'attachNetworkInterface', attachSpy);

  jest.spyOn(JSON, 'parse').mockImplementation(jest.fn( () => {throw 47;} ));

  // THEN
  // eslint-disable-next-line: no-floating-promises
  await expect(handler(event)).resolves.not.toThrow();
  expect(console.error).toHaveBeenCalledTimes(2); // 2 = each of the two records printing one error message.
});
