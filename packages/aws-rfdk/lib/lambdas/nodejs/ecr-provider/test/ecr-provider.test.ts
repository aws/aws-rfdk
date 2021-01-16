/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';

import { ThinkboxEcrProvider } from '../../lib/ecr-provider';

jest.mock('fs');
jest.mock('https');

describe('ThinkboxEcrProvider', () => {
  let ecrProvider: ThinkboxEcrProvider;

  describe('without indexPath', () => {
    class MockResponse extends EventEmitter {
      public statusCode: number = 200;
    }

    let request: EventEmitter;
    let response: MockResponse;

    /**
     * Mock implementation of a successful HTTPS GET request
     *
     * @param _url The URL of the HTTPS request
     * @param callback The callback to call when a response is available
     */
    function httpGetMockSuccess(_url: string, callback: (_request: any) => void) {
      if (callback) {
        callback(response);
      }
      return request;
    }

    /**
     * Mock implementation of a failed HTTPS GET request
     *
     * @param _url The URL of the HTTPS request
     * @param _callback The callback to call when a response is available
     */
    function httpGetMockError(_url: string, _callback: (request: any) => void) {
      return request;
    }

    beforeEach(() => {
      request = new EventEmitter();
      response = new MockResponse();
      jest.requireMock('https').get.mockImplementation(httpGetMockSuccess);

      // GIVEN
      ecrProvider = new ThinkboxEcrProvider();
    });

    const EXPECTED_URL = 'https://downloads.thinkboxsoftware.com/deadline_ecr.json';
    test(`gets ${EXPECTED_URL} for global lookup`, async () => {
      // GIVEN
      const mockBaseArn = 'baseARN';
      const mockData = {
        global: mockBaseArn,
      };

      // WHEN
      const promise = ecrProvider.getGlobalEcrBaseURI();
      response.emit('data', JSON.stringify(mockData));
      response.emit('end');
      await promise;

      // THEN
      // should make an HTTPS request for the ECR index
      expect(jest.requireMock('https').get)
        .toBeCalledWith(
          EXPECTED_URL,
          expect.any(Function),
        );
    });

    describe('.getGlobalEcrBaseArn()', () => {
      test('obtains global prefix from index', async () => {
        // GIVEN
        const mockBaseArn = 'baseARN';
        const mockData = {
          global: mockBaseArn,
        };

        // WHEN
        const promise = ecrProvider.getGlobalEcrBaseURI();
        response.emit('data', JSON.stringify(mockData));
        response.emit('end');

        // THEN
        await expect(promise)
          .resolves
          .toEqual(mockBaseArn);
      });

      test('handles request errors', async () => {
        // GIVEN
        const error = new Error('test');
        jest.requireMock('https').get.mockImplementation(httpGetMockError);
        function simulateRequestError() {
          request.emit('error', error);
        };

        // WHEN
        const promise = ecrProvider.getGlobalEcrBaseURI();
        simulateRequestError();

        // THEN
        await expect(promise)
          .rejects
          .toThrowError(error);
      });

      test.each([
        [404],
        [401],
        [500],
      ])('handles %d response errors', async (statusCode: number) => {
        // GIVEN
        response.statusCode = statusCode;

        // WHEN
        const promise = ecrProvider.getGlobalEcrBaseURI();
        response.emit('data', '');
        response.emit('end');

        // THEN
        await expect(promise)
          .rejects
          .toThrowError(`Expected status code 200, but got ${statusCode}`);
      });

      test('fails on bad JSON', async () => {
        // GIVEN
        const responseBody = 'this is not json';

        // WHEN
        const promise = ecrProvider.getGlobalEcrBaseURI();
        response.emit('data', responseBody);
        response.emit('end');

        // THEN
        await expect(promise)
          .rejects
          .toThrow(/^ECR index file contains invalid JSON: ".*"$/);
      });
    });
  });

  describe('with indexPath', () => {
    // GIVEN
    const globalURIPrefix = 'globalURIPrefix';
    const indexPath = 'somefile';

    beforeEach(() => {
      // WHEN
      const existsSync: jest.Mock = jest.requireMock('fs').existsSync;
      const readFileSync: jest.Mock = jest.requireMock('fs').readFileSync;

      // reset tracked calls to mocks
      existsSync.mockReset();
      readFileSync.mockReset();
      // set the default mock implementations
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        global: globalURIPrefix,
      }));

      ecrProvider = new ThinkboxEcrProvider(indexPath);
    });

    describe('.getGlobalEcrBaseURI', () => {
      let baseURIPromise: Promise<string>;

      beforeEach(() => {
        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();
      });

      test('reads file', async () => {
        // THEN
        await expect(baseURIPromise)
          .resolves.toEqual(globalURIPrefix);
        expect(fs.existsSync).toBeCalledTimes(1);
        expect(fs.readFileSync).toBeCalledWith(indexPath, 'utf8');
      });

      test('returns correct prefix', async () => {
        await expect(baseURIPromise)
          .resolves
          .toEqual(globalURIPrefix);
      });

      test.each([
        ['existsSync'],
        ['readFileSync'],
      ])('fails on fs.%s exception', async (methodName: string) => {
        // GIVEN
        const error = new Error('message');
        jest.requireMock('fs')[methodName].mockImplementation(() => {
          throw error;
        });
        ecrProvider = new ThinkboxEcrProvider(indexPath);

        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

        // THEN
        await expect(baseURIPromise)
          .rejects
          .toThrowError(error);
      });

      test('fails on missing "global" object key', async () => {
        // GIVEN
        jest.requireMock('fs').readFileSync.mockReturnValue(JSON.stringify({
          noGlobalKey: true,
        }));
        ecrProvider = new ThinkboxEcrProvider(indexPath);

        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

        // THEN
        await expect(baseURIPromise)
          .rejects
          .toThrowError('No global ECR');
      });

      test('fails on "global" key not being a string', async () => {
        // GIVEN
        const globalValue = 1;
        jest.requireMock('fs').readFileSync.mockReturnValue(JSON.stringify({
          global: globalValue,
        }));
        ecrProvider = new ThinkboxEcrProvider(indexPath);

        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

        // THEN
        await expect(baseURIPromise)
          .rejects
          .toThrowError(`Unexpected type for global base ECR URI: "${typeof(globalValue)}`);
      });

      test('fails on non-existent file', async () => {
        // GIVEN
        jest.requireMock('fs').existsSync.mockReturnValue(false);
        ecrProvider = new ThinkboxEcrProvider(indexPath);

        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

        // THEN
        await expect(baseURIPromise)
          .rejects
          .toThrowError(`File "${indexPath}" was not found`);
      });

      test('fails on bad JSON', async () => {
        // GIVEN
        jest.requireMock('fs').readFileSync.mockReturnValue('bad json');
        ecrProvider = new ThinkboxEcrProvider(indexPath);

        // WHEN
        baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

        // THEN
        await expect(baseURIPromise)
          .rejects
          .toThrow(/^ECR index file contains invalid JSON: ".*"$/);
      });
    });
  });
});
