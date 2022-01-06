/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { DeadlineClient, Response } from '../../deadline-client';
import { SpotEventPluginClient, CollectionType } from '../spot-event-plugin-client';

describe('SpotEventPluginClient', () => {
  const poolsColection = {
    Pools: ['pool_name'],
    ObsoletePools: [],
  };
  const groupsColection = {
    Pools: ['group_name'],
    ObsoletePools: [],
  };
  const successfulPoolResponse: Response = {
    data: { ...poolsColection },
    fullResponse: new IncomingMessage(new Socket()),
  };

  const successfulGroupResponse: Response = {
    data: { ...groupsColection },
    fullResponse: new IncomingMessage(new Socket()),
  };

  let spotEventPluginClient: SpotEventPluginClient;
  let describeDataResponse: Response;
  let successfulResponse: Response;
  let consoleLogMock: jest.SpyInstance<any, any>;
  let consoleErrorMock: jest.SpyInstance<any, any>;

  beforeEach(() => {
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
    consoleErrorMock = jest.spyOn(console, 'error').mockReturnValue(undefined);

    describeDataResponse = {
      data: {
        ServerData: [{
          ID: 'event.plugin.spot',
          ConcurrencyToken: 'token',
        }],
      },
      fullResponse: new IncomingMessage(new Socket()),
    };
    successfulResponse = {
      data: {},
      fullResponse: new IncomingMessage(new Socket()),
    };

    spotEventPluginClient = new SpotEventPluginClient(new DeadlineClient({
      host: 'test',
      port: 0,
      protocol: 'HTTP',
    }));
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn();
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('successful saveServerData', async () => {
    // GIVEN
    const configuration = 'configuration';
    const mockSuccessfulPostRequest = jest.fn( (_a) => Promise.resolve(successfulResponse) );

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['concurrencyToken'] = jest.fn().mockResolvedValue('token');
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockSuccessfulPostRequest;
    const result = await spotEventPluginClient.saveServerData(configuration);

    // THEN
    expect(result).toBeTruthy();
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledTimes(1);
    expect(consoleLogMock.mock.calls.length).toBe(2);
    expect(consoleLogMock.mock.calls[0][0]).toMatch(/Saving server data configuration:/);
    expect(consoleLogMock.mock.calls[1][0]).toMatch(configuration);
  });

  test('failed saveServerData on post request', async () => {
    // GIVEN
    const statusMessage = 'error message';

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['concurrencyToken'] = jest.fn().mockResolvedValue('token');
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockRejectedValue(statusMessage);
    const result = await spotEventPluginClient.saveServerData('configuration');

    // THEN
    expect(result).toBeFalsy();
    expect(consoleErrorMock.mock.calls.length).toBe(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(`Failed to save server data. Reason: ${statusMessage}`);
  });

  test('failed saveServerData on concurrency token', async () => {
    // GIVEN
    const statusMessage = 'error message';

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['concurrencyToken'] = jest.fn().mockRejectedValue(statusMessage);
    const result = await spotEventPluginClient.saveServerData('configuration');

    // THEN
    expect(result).toBeFalsy();
    expect(consoleErrorMock.mock.calls.length).toBe(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(`Failed to save server data. Reason: ${statusMessage}`);
  });

  test('successful configureSpotEventPlugin', async () => {
    // GIVEN
    const configs = [
      {
        Key: 'testkey',
        Value: 'testValue',
      },
      {
        Key: 'testkey2',
        Value: 'testValue2',
      },
    ];
    const mockConfigureSpotEventPlugin = jest.fn( (_a) => Promise.resolve(successfulResponse) );

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockConfigureSpotEventPlugin;
    const result = await spotEventPluginClient.configureSpotEventPlugin(configs);

    // THEN
    expect(result).toBeTruthy();
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledTimes(1);
    expect(consoleLogMock.mock.calls.length).toBe(2);
    expect(consoleLogMock.mock.calls[0][0]).toMatch(/Saving plugin configuration:/);
    expect(consoleLogMock.mock.calls[1][0]).toEqual(configs);
  });

  test('failed configureSpotEventPlugin', async () => {
    // GIVEN
    const configs = [
      {
        Key: 'testkey',
        Value: 'testValue',
      },
      {
        Key: 'testkey2',
        Value: 'testValue2',
      },
    ];
    const statusMessage = 'error message';

    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockRejectedValue(statusMessage);
    const result = await spotEventPluginClient.configureSpotEventPlugin(configs);

    // THEN
    expect(result).toBeFalsy();
    expect(consoleErrorMock.mock.calls.length).toBe(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(`Failed to save plugin configuration. Reason: ${statusMessage}`);
  });

  test('valid concurrency token', async () => {
    // GIVEN
    const concurrencyToken = 'TOKEN';
    const validResponse = {
      data: {
        ServerData: [{
          ID: 'event.plugin.spot',
          ConcurrencyToken: concurrencyToken,
        }],
      },
    };

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['describeServerData'] = jest.fn().mockResolvedValue(validResponse);
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['concurrencyToken']();

    // THEN
    expect(result).toBe(concurrencyToken);
  });

  test('returns empty token if no event plugin id entry', async () => {
    // GIVEN
    const noSpotEventOluginResponse = {
      data: {
        ServerData: [{
          ID: 'NOT.event.plugin.spot',
          ConcurrencyToken: 'token',
        }],
      },
    };

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['describeServerData'] = jest.fn().mockResolvedValue(noSpotEventOluginResponse);
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['concurrencyToken']();

    // THEN
    expect(result).toBe('');
  });

  test('throws if invalid server data', async () => {
    // GIVEN
    const invalidDescribeDataResponse = {
      data: {
        NotServerData: {},
      },
    };

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['describeServerData'] = jest.fn().mockResolvedValue(invalidDescribeDataResponse);
    // eslint-disable-next-line dot-notation
    const promise = spotEventPluginClient['concurrencyToken']();

    // THEN
    await expect(promise).rejects.toThrowError(`Failed to receive a ConcurrencyToken. Invalid response: ${invalidDescribeDataResponse.data}.`);
  });

  test('successful describeServerData', async () => {
    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockResolvedValue(describeDataResponse);
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['describeServerData']();

    // THEN
    expect(result).toEqual(describeDataResponse);
  });

  test('failed describeServerData', async () => {
    // GIVEN
    const statusMessage = 'error message';

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockRejectedValue(statusMessage);
    // eslint-disable-next-line dot-notation
    const promise = spotEventPluginClient['describeServerData']();

    // THEN
    await expect(promise).rejects.toEqual(statusMessage);
  });

  test.each([
    [CollectionType.Group, successfulGroupResponse, groupsColection],
    [CollectionType.Pool, successfulPoolResponse, poolsColection],
  ])('Successful getCollection for %s', async (type: CollectionType, response: Response, expectedResult: any) => {
    // GIVEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(response);

    // WHEN
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['getCollection'](type);

    // THEN
    expect(result).toEqual(expectedResult);
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].GetRequest).toBeCalledTimes(1);
    expect(consoleLogMock).toBeCalledTimes(1);
    expect(consoleLogMock).toBeCalledWith(expect.stringMatching(`Getting ${type} collection:`));
  });

  test('failed getCollection', async () => {
    // GIVEN
    const statusMessage = 'error message';

    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockRejectedValue(new Error(statusMessage));
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['getCollection'](CollectionType.Group);

    // THEN
    expect(result).toBeUndefined();
    expect(consoleErrorMock).toBeCalledTimes(1);
    expect(consoleErrorMock).toBeCalledWith(expect.stringMatching(`Failed to get group collection. Reason: ${statusMessage}`));
  });

  test('failed getCollection with invalid response', async () => {
    // GIVEN
    const invalidGroupResponse = {
      data: {
        Pools: {},
      },
    };

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(invalidGroupResponse);
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['getCollection'](CollectionType.Group);

    // THEN
    expect(result).toBeUndefined();
    expect(consoleErrorMock).toBeCalledTimes(1);
    expect(consoleErrorMock).toBeCalledWith(expect.stringMatching(`Failed to receive a group collection. Invalid response: ${JSON.stringify(invalidGroupResponse.data)}.`));
  });

  test.each([
    [CollectionType.Group, groupsColection],
    [CollectionType.Pool, poolsColection],
  ])('successful saveCollection for %s', async (type: CollectionType, expectedResult: any) => {
    // GIVEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockResolvedValue({});

    // WHEN
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['saveCollection'](expectedResult, type);

    // THEN
    expect(result).toBeTruthy();
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledTimes(1);
    expect(consoleLogMock).toBeCalledTimes(2);
    expect(consoleLogMock).toBeCalledWith(expect.stringMatching(`Saving ${type} collection:`));
    expect(consoleLogMock).toBeCalledWith(expectedResult);
  });

  test('failed saveCollection', async () => {
    // GIVEN
    const statusMessage = 'error message';

    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockRejectedValue(new Error(statusMessage));

    // WHEN
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['saveCollection'](groupsColection, CollectionType.Group);

    // THEN
    expect(result).toBeFalsy();
    expect(consoleErrorMock).toBeCalledTimes(1);
    expect(consoleErrorMock).toBeCalledWith(expect.stringMatching(`Failed to save group collection. Reason: ${statusMessage}`));
  });

  test.each([
    [ [], ['gr1', 'gr2'] ],
    [['gr1', 'gr2'],['gr1', 'gr2']],
    [['gr1', 'gr2'],['gr1', 'gr3']],
    [['gr1', 'gr2'],[]],
  ])('successful call addGroup with existing groups %s and added groups %s', async (currentGroupsCollection: string[], addedGroupsCollection: string[]) => {
    // GIVEN
    const obsoletePools = ['obsolete_pool'];
    const groupResponse: Response = {
      data: {
        Pools: currentGroupsCollection,
        ObsoletePools: obsoletePools,
      },
      fullResponse: new IncomingMessage(new Socket()),
    };
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(groupResponse);
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockReturnValue(true);

    // WHEN
    await spotEventPluginClient.addGroups(addedGroupsCollection);

    // THEN
    const requestsCount = addedGroupsCollection.length > 0 ? 1 : 0;
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].GetRequest).toBeCalledTimes(requestsCount);

    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledTimes(requestsCount);
    if (requestsCount>0) {
      // eslint-disable-next-line dot-notation, jest/no-conditional-expect
      expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledWith(
        '/db/settings/collections/groups/save',
        {
          Pools: Array.from(new Set(currentGroupsCollection.concat(addedGroupsCollection))),
          ObsoletePools: obsoletePools,
        },
        {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
      );
    }
  });

  test.each([
    [ [], ['pool1', 'pool2'] ],
    [['pool1', 'pool2'],['pool1', 'pool2']],
    [['pool1', 'pool2'],['pool1', 'pool3']],
    [['pool1', 'pool2'],[]],
  ])('successful call addPool with existing pools %s and added pools %s', async (currentPoolsCollection: string[], addedPoolsCollection: string[]) => {
    // GIVEN
    const obsoletePools = ['obsolete_pool'];
    const poolResponse: Response = {
      data: {
        Pools: currentPoolsCollection,
        ObsoletePools: obsoletePools,
      },
      fullResponse: new IncomingMessage(new Socket()),
    };
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(poolResponse);
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn().mockReturnValue(true);

    // WHEN
    await spotEventPluginClient.addPools(addedPoolsCollection);

    // THEN
    const requestsCount = addedPoolsCollection.length > 0 ? 1 : 0;
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].GetRequest).toBeCalledTimes(requestsCount);

    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledTimes(requestsCount);
    if (requestsCount>0) {
      // eslint-disable-next-line dot-notation, jest/no-conditional-expect
      expect(spotEventPluginClient['deadlineClient'].PostRequest).toBeCalledWith(
        '/db/settings/collections/pools/save',
        {
          Pools: Array.from(new Set(currentPoolsCollection.concat(addedPoolsCollection))),
          ObsoletePools: obsoletePools,
        },
        {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
      );
    }
  });

  test('does not add groups when groups were not retrieved successfully', async () => {
    // GIVEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(undefined);

    // WHEN
    const added = await spotEventPluginClient.addGroups(['group']);

    // THEN
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].GetRequest).toBeCalledTimes(1);
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).not.toBeCalled();
    expect(added).toBe(false);
  });

  test('does not add pools when pools were not retrieved successfully', async () => {
    // GIVEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn().mockResolvedValue(undefined);

    // WHEN
    const added = await spotEventPluginClient.addPools(['pool']);

    // THEN
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].GetRequest).toBeCalledTimes(1);
    // eslint-disable-next-line dot-notation
    expect(spotEventPluginClient['deadlineClient'].PostRequest).not.toBeCalled();
    expect(added).toBe(false);
  });
});
