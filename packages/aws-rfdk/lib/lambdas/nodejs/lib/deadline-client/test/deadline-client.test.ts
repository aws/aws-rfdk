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

  describe('successful responses', () => {
    class MockResponse extends EventEmitter {
      public statusCode: number = 200;
    }

    class MockRequest extends EventEmitter {
      public end() {}
      public write(data: string) { data; }
    }

    let consoleLogMock: jest.SpyInstance<any, any>;
    let request: MockRequest;
    let response: MockResponse;

    /**
     * Mock implementation of an HTTP request
     *
     * @param _url The URL of the HTTP request
     * @param callback The callback to call when a response is available
     */
    function httpRequestMock(_url: string, callback: (_request: any) => void) {
      if (callback) {
        callback(response);
      }
      return request;
    }

    beforeEach(() => {
      consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
      request = new MockRequest();
      jest.requireMock('http').request.mockReset();
      jest.requireMock('https').request.mockReset();
    });

    test('successful http get request', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toBeCalledWith(
          {
            agent: undefined,
            method: 'GET',
            port: 8080,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );
    });

    test('successful http get request with options', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const promise = deadlineClient.GetRequest('/get/version/test', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toBeCalledWith(
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
    });

    test('failed http get request', async () => {
      // GIVEN
      response = new MockResponse();
      response.statusCode = 400;
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });
      const promise = deadlineClient.GetRequest('/get/version/test');

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(expect.any(Error));
    });

    test('successful https get request', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });

      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('https').request)
        .toBeCalledWith(
          {
            agent: expect.any(Object),
            method: 'GET',
            port: 4433,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );
    });

    test('failed https get request', async () => {
      // GIVEN
      response = new MockResponse();
      response.statusCode = 400;
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });
      const promise = deadlineClient.GetRequest('/get/version/test');

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(expect.any(Error));
    });

    test('successful https get request with tls', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
        tls: {
          ca: 'content',
          pfx: 'content',
          passphrase: 'content',
        },
      });

      const promise = deadlineClient.GetRequest('/get/version/test');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('https').request)
        .toBeCalledWith(
          {
            agent: expect.any(Object),
            method: 'GET',
            port: 4433,
            host: 'hostname',
            path: '/get/version/test',
          },
          expect.any(Function),
        );
    });

    test('successful http post request', async () => {
      // GIVEN
      jest.requireMock('http').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });

      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('http').request)
        .toBeCalledWith(
          {
            agent: undefined,
            method: 'POST',
            port: 8080,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );
    });

    test('failed http post request', async () => {
      // GIVEN
      response = new MockResponse();
      response.statusCode = 400;
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });
      const promise = deadlineClient.PostRequest('/save/version/test');

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(expect.any(Error));
    });

    test('successful https post request', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });

      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('https').request)
        .toBeCalledWith(
          {
            agent: expect.any(Object),
            method: 'POST',
            port: 4433,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );
    });

    test('failed https post request', async () => {
      // GIVEN
      response = new MockResponse();
      response.statusCode = 400;
      jest.requireMock('https').request.mockImplementation(httpRequestMock);

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
      });
      const promise = deadlineClient.PostRequest('/get/version/test', 'anydata');

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(expect.any(Error));
    });

    test('successful https post request with tls', async () => {
      // GIVEN
      jest.requireMock('https').request.mockImplementation(httpRequestMock);
      response = new MockResponse();

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 4433,
        protocol: 'HTTPS',
        tls: {
          ca: 'content',
          pfx: 'content',
          passphrase: 'content',
        },
      });

      const promise = deadlineClient.PostRequest('/save/version/test', 'anydata');
      response.emit('data', Buffer.from(JSON.stringify(''), 'utf8'));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTP request
      expect(jest.requireMock('https').request)
        .toBeCalledWith(
          {
            agent: expect.any(Object),
            method: 'POST',
            port: 4433,
            host: 'hostname',
            path: '/save/version/test',
          },
          expect.any(Function),
        );
    });

    test('retries get request with 503', async () => {
      // GIVEN
      const retries = 3;
      response = new MockResponse();
      response.statusCode = 503;
      jest.requireMock('http').request.mockImplementation(httpRequestMock);

      // WHEN
      deadlineClient = new DeadlineClient({
        host: 'hostname',
        port: 8080,
        protocol: 'HTTP',
      });
      const promise = deadlineClient.GetRequest('/get/version/test', undefined, retries, 0);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(expect.any(Error));

      expect(jest.requireMock('http').request)
        .toBeCalledTimes(retries + 1);

      expect(consoleLogMock.mock.calls.length).toBe(retries * 2);
      expect(consoleLogMock.mock.calls[0][0]).toMatch(/Request failed with/);
      expect(consoleLogMock.mock.calls[1][0]).toMatch(/Retries left:/);
    });
  });
});
