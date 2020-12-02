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
      getRegionalEcrBaseArn: jest.fn<Promise<string>, [string]>((region) => {
        return Promise.resolve(`arn:aws:ecr:${region}:258503199323:repository/deadline/`);
      }),
      getGlobalEcrBaseURI: jest.fn<Promise<string>, []>(() => {
        return Promise.resolve('global.dkr.ecr.amazonaws.com/deadline/');
      }),
    };

    constructor(indexFilePath?: string) {
      ThinkboxEcrProviderMock.mocks.constructor(indexFilePath);
    }

    getRegionalEcrBaseArn(region: string) {
      return ThinkboxEcrProviderMock.mocks.getRegionalEcrBaseArn(region);
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
  const DEFAULT_REGION = 'us-west-2';

  let ecrProviderResource: ThinkboxEcrProviderResource;
  let region: string = DEFAULT_REGION;

  beforeAll(() => {
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.spyOn(console, 'info').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockReturnValue(undefined);
  });

  beforeEach(() => {
    ecrProviderResource = new ThinkboxEcrProviderResource();
    region = DEFAULT_REGION;
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
      test.each<[string | undefined, string | undefined]>([
        [region, undefined],
        [undefined, 'testValue'],
        [region, 'testValue'],
        [undefined, undefined],
      ])('{Region=%s, ForceRun=%s}', async (regionInput: string | undefined, forceRun: string | undefined) => {
        // GIVEN
        const input = {
          region: regionInput,
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
      { Region: 1 },
      { Region: [1] },
      { Region: { a: 1 } },
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

    test('regional', async () => {
      // GIVEN
      const mockBaseArn = 'baseARN';
      const ThinkboxEcrProvider = jest.requireMock('../../lib/ecr-provider').ThinkboxEcrProvider;
      ThinkboxEcrProvider.mocks.getRegionalEcrBaseArn.mockReturnValue(Promise.resolve(mockBaseArn));

      // WHEN
      const promise = ecrProviderResource.doCreate('someID', {
        ForceRun: 'forceRun',
        Region: region,
      });
      const result = await promise;

      // THEN
      expect(ThinkboxEcrProvider.mocks.constructor).toHaveBeenCalledTimes(1);
      expect(ThinkboxEcrProvider.mocks.getRegionalEcrBaseArn).toHaveBeenCalledWith(region);
      expect(result).toEqual({
        EcrArnPrefix: mockBaseArn,
      });
    });
  });
});
