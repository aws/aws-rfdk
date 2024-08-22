/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  ECSClient,
  DescribeServicesCommand,
  DescribeServicesResponse,
} from '@aws-sdk/client-ecs';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  WaitForStableServiceResource,
  WaitForStableServiceResourceProps,
} from '../handler';

describe('WaitForStableServiceResource', () => {
  describe('doCreate', () => {
    let consoleLogMock: jest.SpyInstance<any, any>;
    const ecsMock = mockClient(ECSClient);

    beforeEach(() => {
      consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
    });

    afterEach(() => {
      jest.clearAllMocks();
      ecsMock.reset();
    });

    test('success', async () => {
      // GIVEN
      const props: WaitForStableServiceResourceProps = {
        cluster: 'clusterArn',
        services: ['serviceArn'],
      };

      // response for an "ACTIVE" service
      const response: DescribeServicesResponse = {
        services: [
          {
            deployments: [{}],
            runningCount: 1,
            desiredCount: 1,
          },
        ],
      };
      ecsMock.on(DescribeServicesCommand).resolves(response);
      const handler = new WaitForStableServiceResource(new ECSClient());

      // WHEN
      const result = await handler.doCreate('physicalId', props);

      // THEN
      expect(result).toBeUndefined();
      expect(consoleLogMock.mock.calls.length).toBe(2);
      expect(consoleLogMock.mock.calls[0][0]).toStrictEqual(`Waiting for ECS services to stabilize. Cluster: ${props.cluster}. Services: ${props.services[0]}`);
      expect(consoleLogMock.mock.calls[1][0]).toStrictEqual('Finished waiting. ECS services are stable.');
    });

    test('failure', async () => {
      // GIVEN
      const props: WaitForStableServiceResourceProps = {
        cluster: 'clusterArn',
        services: ['serviceArn'],
      };

      ecsMock.on(DescribeServicesCommand).resolves({failures: [{reason: 'MISSING', detail: 'test failure'}]});
      const handler = new WaitForStableServiceResource(new ECSClient());

      // WHEN
      const promise = handler.doCreate('physicalId', props);

      // THEN
      await expect(promise).rejects.toThrow(/ECS services failed to stabilize in expected time:/);
    });
  });

  test('doDelete does not do anything', async () => {
    // GIVEN
    const props: WaitForStableServiceResourceProps = {
      cluster: 'clusterArn',
      services: ['serviceArn'],
    };
    const handler = new WaitForStableServiceResource(new ECSClient());

    // WHEN
    const promise = await handler.doDelete('physicalId', props);

    // THEN
    await expect(promise).toBeUndefined();
  });

  describe('.validateInput()', () => {
    test('returns true with valid input', async () => {
      // GIVEN
      const validInput: WaitForStableServiceResourceProps = {
        cluster: 'clusterArn',
        services: ['serviceArn'],
        forceRun: '',
      };
      // WHEN
      const handler = new WaitForStableServiceResource(new ECSClient());
      const returnValue = handler.validateInput(validInput);

      // THEN
      expect(returnValue).toBeTruthy();
    });

    const noCluster = {
      services: [''],
    };
    const clusterNotString = {
      services: [''],
      cluster: 10,
    };
    const noServices = {
      cluster: '',
    };
    const servicesNotArray = {
      cluster: '',
      services: '',
    };
    const servicesNotArrayOfStrings = {
      cluster: '',
      services: [10],
    };
    const forceRunNotString = {
      cluster: '',
      services: [''],
      forceRun: true,
    };

    test.each([
      [],
      '',
      noCluster,
      clusterNotString,
      noServices,
      servicesNotArray,
      servicesNotArrayOfStrings,
      forceRunNotString,
    ])('returns false with invalid input %p', async (invalidInput: any) => {
      // WHEN
      const handler = new WaitForStableServiceResource(new ECSClient());
      const returnValue = handler.validateInput(invalidInput);

      // THEN
      expect(returnValue).toBeFalsy();
    });
  });
});
