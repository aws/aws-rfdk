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
  /**
   * Suite of parametrized tests for testing the ECR index schema validation.
   *
   * The suite is an array of tests, where each test should fail validation. Each test is represented as an array of two
   * elements: [name, indexObject]
   *
   * - The first element is the name describing what is contained in the value
   * - The second element is the value that should be JSON encoded and supplied to the ThinkboxEcrProvider
   */
  const INDEX_SCHEMA_VALIDATION_SUITE: Array<[string, any]> = [
    [
      'array',
      [],
    ],
    [
      'number',
      1,
    ],
    [
      'string',
      'abc',
    ],
    [
      'object missing registry',
      {
        products: {
          deadline: {
            namespace: 'a',
          },
        },
      },
    ],
    [
      'object with registry with wrong type',
      {
        registry: 1,
        products: {
          deadline: {
            namespace: 'a',
          },
        },
      },
    ],
    [
      'object missing products',
      {
        registry: {
          uri: 'a',
        },
      },
    ],
    [
      'object with products with wrong type',
      {
        registry: {
          uri: 'a',
        },
        products: 1,
      },
    ],
    [
      'object with registry missing uri',
      {
        registry: {},
        products: {
          deadline: {
            namespace: 'a',
          },
        },
      },
    ],
    [
      'object with registry uri with wrong type',
      {
        registry: {
          uri: 1,
        },
        products: {
          deadline: {
            namespace: 'a',
          },
        },
      },
    ],
    [
      'object with missing products.deadline',
      {
        registry: {
          uri: 1,
        },
        products: {},
      },
    ],
    [
      'object with products.deadline with wrong type',
      {
        registry: {
          uri: 1,
        },
        products: {
          deadline: 1,
        },
      },
    ],
    [
      'object with missing products.deadline.namespace',
      {
        registry: {
          uri: 1,
        },
        products: {
          deadline: {},
        },
      },
    ],
    [
      'object with products.deadline.namespace with wrong type',
      {
        registry: {
          uri: 1,
        },
        products: {
          deadline: {
            namespace: 1,
          },
        },
      },
    ],
  ];

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

    const EXPECTED_URL = 'https://downloads.thinkboxsoftware.com/thinkbox_ecr.json';
    test(`gets ${EXPECTED_URL} for global lookup`, async () => {
      // GIVEN
      const registryUri = 'registryUri';
      const deadlineNamespace = 'namespace';
      const mockData = {
        registry: {
          uri: registryUri,
        },
        products: {
          deadline: {
            namespace: deadlineNamespace,
          },
        },
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
        const registryUri = 'registryUri';
        const deadlineNamespace = 'namespace';
        const mockData = {
          registry: {
            uri: registryUri,
          },
          products: {
            deadline: {
              namespace: deadlineNamespace,
            },
          },
        };
        const expectedBaseArn = `${registryUri}/${deadlineNamespace}`;

        // WHEN
        const promise = ecrProvider.getGlobalEcrBaseURI();
        response.emit('data', JSON.stringify(mockData));
        response.emit('end');

        // THEN
        await expect(promise)
          .resolves
          .toEqual(expectedBaseArn);
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

      describe('index schema validation', () => {
        test.each(INDEX_SCHEMA_VALIDATION_SUITE)('fails when fetching %s', async (_name: string, value: any) => {
          // WHEN
          const promise = ecrProvider.getGlobalEcrBaseURI();
          response.emit('data', JSON.stringify(value));
          response.emit('end');

          // THEN
          await expect(promise)
            .rejects
            .toThrowError(/^expected .+ to be an? .+ but got .+$/);
        });
      });
    });
  });

  describe('with indexPath', () => {
    // GIVEN
    const registryUri = 'registryUri';
    const deadlineNamespace = 'deadlineNamespace';
    const indexPath = 'somefile';
    const mockData = {
      registry: {
        uri: registryUri,
      },
      products: {
        deadline: {
          namespace: deadlineNamespace,
        },
      },
    };
    const globalURIPrefix = `${registryUri}/${deadlineNamespace}`;

    beforeEach(() => {
      // WHEN
      const existsSync: jest.Mock = jest.requireMock('fs').existsSync;
      const readFileSync: jest.Mock = jest.requireMock('fs').readFileSync;

      // reset tracked calls to mocks
      existsSync.mockReset();
      readFileSync.mockReset();
      // set the default mock implementations
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockData));

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

      describe('index schema validation', () => {
        test.each(INDEX_SCHEMA_VALIDATION_SUITE)('fails when fetching %s', async (_name: string, value: any) => {
          // GIVEN
          jest.requireMock('fs').readFileSync.mockReturnValue(JSON.stringify(value));
          ecrProvider = new ThinkboxEcrProvider(indexPath);

          // WHEN
          baseURIPromise = ecrProvider.getGlobalEcrBaseURI();

          // THEN
          await expect(baseURIPromise)
            .rejects
            .toThrowError(/^expected .+ to be an? .+ but got .+$/);
        });
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
