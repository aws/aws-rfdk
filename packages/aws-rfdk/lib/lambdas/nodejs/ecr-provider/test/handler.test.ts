/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import { ThinkboxEcrProviderResource } from '../handler';

jest.mock('../../lib/ecr-provider', () => {
  class ThinkboxEcrProviderMock {
    static readonly mocks = {
      constructor: jest.fn(),
      getGlobalEcrBaseURI: jest.fn<Promise<string>, []>(() => {
        return Promise.resolve('public.ecr.aws/deadline/');
      }),
    };

    constructor(indexFilePath?: string) {
      ThinkboxEcrProviderMock.mocks.constructor(indexFilePath);
    }

    getGlobalEcrBaseURI() {
      return ThinkboxEcrProviderMock.mocks.getGlobalEcrBaseURI();
    }
  }

  return {
    ThinkboxEcrProvider: ThinkboxEcrProviderMock,
  };
});

jest.mock('https');

describe('ThinkboxEcrProviderResource', () => {
  let ecrProviderResource: ThinkboxEcrProviderResource;

  beforeAll(() => {
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.spyOn(console, 'info').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockReturnValue(undefined);
  });

  beforeEach(() => {
    ecrProviderResource = new ThinkboxEcrProviderResource();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('.validateInput()', () => {
    // Valid configurations
    describe('should return true if', () => {
      test.each<string | undefined>([
        'testValue',
        undefined,
      ])('{ForceRun=%s}', async (forceRun: string | undefined) => {
        // GIVEN
        const input = {
          forceRun,
        };

        // WHEN
        const returnValue = ecrProviderResource.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });
    });

    // Invalid configurations
    const invalidConfigs = [
      { ForceRun: 1 },
      { ForceRun: [1] },
      { ForceRun: { a: 1 } },
      [],
      'abc',
      1,
    ];
    describe('should return false if', () => {
      test.each<[any, any]>(invalidConfigs.map((config: any) => {
        return [
          JSON.stringify(config),
          config,
        ];
      }))('%s', async (_str: string, config: any) => {
        expect(ecrProviderResource.validateInput(config)).toBeFalsy();
      });
    });
  });

  describe('uses ThinkboxEcrProvider', () => {
    test('global', async () => {
      // GIVEN
      const mockBaseURI = 'baseURI';
      const ThinkboxEcrProvider = jest.requireMock('../../lib/ecr-provider').ThinkboxEcrProvider;
      ThinkboxEcrProvider.mocks.getGlobalEcrBaseURI.mockReturnValue(Promise.resolve(mockBaseURI));

      // WHEN
      const promise = ecrProviderResource.doCreate('someID', {
        ForceRun: 'forceRun',
      });
      const result = await promise;

      // THEN
      expect(ThinkboxEcrProvider.mocks.constructor).toHaveBeenCalledTimes(1);
      expect(ThinkboxEcrProvider.mocks.getGlobalEcrBaseURI).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        EcrURIPrefix: mockBaseURI,
      });
    });
  });
});
