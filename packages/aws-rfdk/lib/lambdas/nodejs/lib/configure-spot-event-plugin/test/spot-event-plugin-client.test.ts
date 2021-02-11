/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { Response } from '../../deadline-client';
import { SpotEventPluginClient } from '../spot-event-plugin-client';

describe('SpotEventPluginClient', () => {
  let spotEventPluginClient: SpotEventPluginClient;
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

    spotEventPluginClient = new SpotEventPluginClient({
      deadlineClientProps: {
        host: 'test',
        port: 100,
        protocol: 'HTTP',
      },
    });
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = jest.fn();
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].GetRequest = jest.fn();
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

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockDescribeData;
    const result = await spotEventPluginClient.describeServerData();

    // THEN
    expect(result).toEqual(describeDataResponse);
  });

  test('saveServerData', async () => {
    // GIVEN
    async function returnSaveServerDataResponse(_v1: any): Promise<Response> {
      return successfulResponse;
    }
    const mockSaveServerData = jest.fn( (a) => returnSaveServerDataResponse(a) );

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockSaveServerData;
    async function returnConcurrencyToken(): Promise<string> {
      return 'token';
    }

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockSaveServerData;
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['concurrencyToken'] = jest.fn( () => returnConcurrencyToken() );
    const result = await spotEventPluginClient.saveServerData('configuration');

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
    async function returnConfigurePluginResponse(_v1: any): Promise<Response> {
      return successfulResponse;
    }
    const mockConfigureSpotEventPlugin = jest.fn( (a) => returnConfigurePluginResponse(a) );

    // WHEN
    // eslint-disable-next-line dot-notation
    spotEventPluginClient['deadlineClient'].PostRequest = mockConfigureSpotEventPlugin;
    const result = await spotEventPluginClient.configureSpotEventPlugin(configs);

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
    spotEventPluginClient.describeServerData = mockDescribeData;
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['concurrencyToken']();

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
    spotEventPluginClient.describeServerData = mockDescribeData;
    // eslint-disable-next-line dot-notation
    const result = await spotEventPluginClient['concurrencyToken']();

    // THEN
    expect(result).toBe('');
  });
});
