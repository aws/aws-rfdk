/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { DeadlineClient, Response } from '../../deadline-client';
import { EventPluginRequests } from '../sep-requests';

describe('EventPluginRequests', () => {
  // let consoleLogMock: jest.SpyInstance<any, any>;
  let mockDeadlineClient: DeadlineClient;
  let eventPluginRequests: EventPluginRequests;
  let describeDataResponse: any;
  let successfulResponse: any;

  beforeEach(() => {
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.spyOn(console, 'info').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockReturnValue(undefined);

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

    mockDeadlineClient = new DeadlineClient({
      host: 'test',
      port: 100,
      protocol: 'HTTP',
    });
    mockDeadlineClient.PostRequest = jest.fn();
    mockDeadlineClient.GetRequest = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('describeServerData', async () => {
    // GIVEN
    async function returnDescribeDataResponse(_v1: any): Promise<Response> {
      return describeDataResponse;
    }
    const mockDescribeData = jest.fn( (a) => returnDescribeDataResponse(a) );
    mockDeadlineClient.PostRequest = mockDescribeData;

    // WHEN
    eventPluginRequests = new EventPluginRequests(mockDeadlineClient);
    const result = await eventPluginRequests.describeServerData();

    // THEN
    expect(result).toEqual(describeDataResponse);
  });

  test('saveServerData', async () => {
    // GIVEN
    async function returnDescribeDataResponse(_v1: any): Promise<Response> {
      return successfulResponse;
    }
    const mockDescribeData = jest.fn( (a) => returnDescribeDataResponse(a) );
    mockDeadlineClient.PostRequest = mockDescribeData;

    // WHEN
    eventPluginRequests = new EventPluginRequests(mockDeadlineClient);
    async function returnConcurrencyToken(): Promise<string> {
      return 'token';
    }
    // eslint-disable-next-line dot-notation
    eventPluginRequests['concurrencyToken'] = jest.fn( () => returnConcurrencyToken() );

    const mockedEventPluginRequests = eventPluginRequests;
    const result = await mockedEventPluginRequests.saveServerData('configuration');

    // THEN
    expect(result).toBeTruthy();
  });

  test('configureSpotEventPlugin', async () => {
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
    async function returnDescribeDataResponse(_v1: any): Promise<Response> {
      return successfulResponse;
    }
    const mockDescribeData = jest.fn( (a) => returnDescribeDataResponse(a) );
    mockDeadlineClient.PostRequest = mockDescribeData;

    // WHEN
    eventPluginRequests = new EventPluginRequests(mockDeadlineClient);
    async function returnConcurrencyToken(): Promise<string> {
      return 'token';
    }
    // eslint-disable-next-line dot-notation
    eventPluginRequests['concurrencyToken'] = jest.fn( () => returnConcurrencyToken() );

    const mockedEventPluginRequests = eventPluginRequests;
    const result = await mockedEventPluginRequests.configureSpotEventPlugin(configs);

    // THEN
    expect(result).toBeTruthy();
  });

  test('valid concurrency token', async () => {
    // GIVEN
    async function returnDescribeDataResponse(): Promise<Response> {
      return describeDataResponse;
    }
    const mockDescribeData = jest.fn( () => returnDescribeDataResponse() );

    // WHEN
    eventPluginRequests = new EventPluginRequests(mockDeadlineClient);
    eventPluginRequests.describeServerData = mockDescribeData;

    const mockedEventPluginRequests = eventPluginRequests;
    // eslint-disable-next-line dot-notation
    const result = await mockedEventPluginRequests['concurrencyToken']();

    // THEN
    expect(result).toBe('token');
  });

  test('no concurrency token for such id', async () => {
    // GIVEN
    describeDataResponse = {
      data: {
        ServerData: [{
          ID: 'NOT.event.plugin.spot',
          ConcurrencyToken: 'token',
        }],
      },
      fullResponse: new IncomingMessage(new Socket()),
    };
    async function returnDescribeDataResponse(): Promise<Response> {
      return describeDataResponse;
    }
    const mockDescribeData = jest.fn( () => returnDescribeDataResponse() );

    // WHEN
    eventPluginRequests = new EventPluginRequests(mockDeadlineClient);
    eventPluginRequests.describeServerData = mockDescribeData;

    const mockedEventPluginRequests = eventPluginRequests;
    // eslint-disable-next-line dot-notation
    const result = await mockedEventPluginRequests['concurrencyToken']();

    // THEN
    expect(result).not.toBe('token');
  });
});
