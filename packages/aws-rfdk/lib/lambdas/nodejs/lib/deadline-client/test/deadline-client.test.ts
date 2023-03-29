/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import { EventEmitter } from 'events';
import { DeadlineClient } from '../deadline-client';

jest.mock('http');
jest.mock('https');

describe('DeadlineClient', () => {
  let deadlineClient: DeadlineClient;

  class MockResponse extends EventEmitter {
    public statusCode: number;
    public statusMessage: string = 'status message';

    public constructor(statusCode: number) {
      super();
      this.statusCode = statusCode;
    }
  }

  class MockRequest extends EventEmitter {
    public end() {}
    public write(_data: string) {}
  }

  let consoleLogMock: jest.SpyInstance<any, any>;
  let request: MockRequest;
  let response: MockResponse;

  /**
   * Mock implementation of the request
   *
   * @param _url The URL of the request
   * @param callback The callback to call when a response is available
   */
  function httpRequestMock(_url: string, callback: (_request: any) => void) {
    if (callback) {
      callback(response);
    }
    return request;
  }

  describe('successful responses', () => {
    beforeEach(() => {
      consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
      request = new MockRequest();
      jest.requireMock('http').request.mockReset();
      jest.requireMock('https').request.mockReset();
      (jest.requireMock('https').Agent as jest.Mock).mockClear();

      response = new MockResponse(200);
    });

    test('successful http get request', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toHaveBeenCalledWith(
          {
            agent: undefined,
            method: 'GET',
            port: 8080,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful http get request with options', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.GetRequest('/get/version/test', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toHaveBeenCalledWith(
          {
            agent: undefined,
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'GET',
            port: 8080,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful https get request', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      const agentMock = jest.requireMock('https').Agent as jest.Mock;
      expect(agentMock).toHaveBeenCalledTimes(1);
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ ca: expect.any(String) }));
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ pfx: expect.any(String) }));
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ passphrase: expect.any(String) }));

      // should make an HTTPS request
      expect(jest.requireMock('https').request)
        .toHaveBeenCalledWith(
          {
            agent: agentMock.mock.instances[0],
            method: 'GET',
            port: 4433,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful https get request with tls', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
        tls: {
          ca: 'cacontent',
          pfx: 'pfxcontent',
          passphrase: 'passphrasecontent',
        },
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      const agentMock = jest.requireMock('https').Agent as jest.Mock;
      expect(agentMock).toHaveBeenCalledTimes(1);
      expect(agentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ca: 'cacontent',
          pfx: 'pfxcontent',
          passphrase: 'passphrasecontent',
        }),
      );
      // should make an HTTPS request
      expect(jest.requireMock('https').request)
        .toHaveBeenCalledWith(
          {
            agent: agentMock.mock.instances[0],
            method: 'GET',
            port: 4433,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful http post request', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toHaveBeenCalledWith(
          {
            agent: undefined,
            method: 'POST',
            port: 8080,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful https post request', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      const agentMock = jest.requireMock('https').Agent as jest.Mock;
      expect(agentMock).toHaveBeenCalledTimes(1);
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ ca: expect.any(String) }));
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ pfx: expect.any(String) }));
      expect(agentMock).toHaveBeenCalledWith(expect.not.objectContaining({ passphrase: expect.any(String) }));

      // should make an HTTP request
      expect(jest.requireMock('https').request)
        .toHaveBeenCalledWith(
          {
            agent: agentMock.mock.instances[0],
            method: 'POST',
            port: 4433,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });

    test('successful https post request with tls', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
        tls: {
          ca: 'cacontent',
          pfx: 'pfxcontent',
          passphrase: 'passphrasecontent',
        },
      });

      const responseData = {
        test: true,
      };

      // WHEN
      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(responseData), 'utf8'));
      response.emit('end');
      const result = await promise;

      // THEN
      const agentMock = jest.requireMock('https').Agent as jest.Mock;
      expect(agentMock).toHaveBeenCalledTimes(1);
      expect(agentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ca: 'cacontent',
          pfx: 'pfxcontent',
          passphrase: 'passphrasecontent',
        }),
      );
      // should make an HTTPS request
      expect(jest.requireMock('https').request)
        .toHaveBeenCalledWith(
          {
            agent: agentMock.mock.instances[0],
            method: 'POST',
            port: 4433,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );

      expect(result.data).toEqual(responseData);
    });
  });

  describe('failed responses', () => {
    beforeEach(() => {
      consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
      request = new MockRequest();
      jest.requireMock('http').request.mockImplementation(httpRequestMock);
      jest.requireMock('https').request.mockImplementation(httpRequestMock);
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.requireMock('http').request.mockReset();
      jest.requireMock('https').request.mockReset();
    });

    describe('returns a rejected promise on 400 responses', () => {
      test.each([
        ['HTTP', 'GET'],
        ['HTTP', 'POST'],
        ['HTTPS', 'GET'],
        ['HTTPS', 'POST'],
      ])('for %p %p', async (protocol: string, requestType: string) => {
        // GIVEN
        response = new MockResponse(400);
        deadlineClient = new DeadlineClient({
          host: 'hostname',
          port: 0,
          protocol: protocol,
        });

        // WHEN
        function performRequest() {
          if (requestType === 'GET') { return deadlineClient.GetRequest('anypath'); }
          return deadlineClient.PostRequest('anypath', 'anydata');
        }
        const promise = performRequest();

        // THEN
        await expect(promise)
          .rejects
          .toEqual(response.statusMessage);

        expect(consoleLogMock.mock.calls.length).toBe(0);
      });
    });

    describe('retries on 503 responses', () => {
      test.each([
        ['HTTP', 'GET'],
        ['HTTP', 'POST'],
        ['HTTPS', 'GET'],
        ['HTTPS', 'POST'],
      ])('for %p %p', async (protocol: string, requestType: string) => {
        // GIVEN
        response = new MockResponse(503);
        const retries = 3;
        deadlineClient = new DeadlineClient({
          host: 'hostname',
          port: 0,
          protocol: protocol,
          retries,
          retryWaitMs: 0,
        });

        // WHEN
        function performRequest() {
          if (requestType === 'GET') { return deadlineClient.GetRequest('anypath'); }
          return deadlineClient.PostRequest('anypath', 'anydata');
        }
        const promise = performRequest();

        // THEN
        await expect(promise)
          .rejects
          .toEqual(response.statusMessage);

        expect(consoleLogMock.mock.calls.length).toBe(retries * 2);
        expect(consoleLogMock.mock.calls[0][0]).toMatch(/Request failed with/);
        expect(consoleLogMock.mock.calls[1][0]).toMatch(/Retries left:/);
      });
    });
  });
});
