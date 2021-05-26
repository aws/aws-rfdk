/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import { BackoffGenerator } from '../backoff-generator';

describe('BackoffGenerator', () => {
  const base = 100;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('throws when jitterDivisor is invalid', () => {
    // GIVEN
    const jitterDivisor = 0;

    // WHEN
    expect(() => new BackoffGenerator({
      jitterDivisor,
    }))

    // THEN
      .toThrow(`jitterDivisor must be a postive integer, got: ${jitterDivisor}`);
  });

  test('stops when max attempts is reached', async () => {
    // GIVEN
    const maxAttempts = 2;
    const backoffGenerator = new BackoffGenerator({
      base,
      maxAttempts,
    });

    // WHEN
    for (let i = 0; i < maxAttempts; i++) {
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base * Math.pow(2, i));
      await promise;
    }

    // THEN
    expect(backoffGenerator.shouldContinue()).toBe(false);
  });

  test('stops when timeout is reached', async () => {
    // GIVEN
    const backoffGenerator = new BackoffGenerator({
      base,
      maxBackoffTimeMs: base,
    });

    // WHEN
    const promise = backoffGenerator.backoff();
    jest.advanceTimersByTime(base);
    await promise;

    // THEN
    expect(backoffGenerator.shouldContinue()).toBe(false);
  });

  test('respects max interval between backoffs', async () => {
    // GIVEN
    const maxIntervalMs = base / 2;
    const backoffGenerator = new BackoffGenerator({
      base,
      maxIntervalMs,
    });

    // WHEN
    const promise = backoffGenerator.backoff();
    jest.advanceTimersByTime(maxIntervalMs);
    await promise;

    // THEN
    expect(maxIntervalMs).toBeLessThan(base);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), maxIntervalMs);
  });

  test('restarts', async () => {
    // GIVEN
    const backoffGenerator = new BackoffGenerator({
      base,
      maxAttempts: 1,
    });
    // This reaches maxAttempts, shouldContinue() will return false
    const promise = backoffGenerator.backoff();
    jest.advanceTimersByTime(base);
    await promise;

    // WHEN
    backoffGenerator.restart();

    // THEN
    expect(backoffGenerator.shouldContinue()).toBe(true);
  });

  describe.each([
    0,
    0.25,
    0.5,
    0.75,
    1,
  ])('jitter (factor %d)', (factor: number) => {
    let randomStub: sinon.SinonStub;
    beforeAll(() => {
      randomStub = sinon.stub(Math, 'random').returns(factor);
    });

    afterAll(() => {
      randomStub.restore();
    });

    test('applies full jitter', async () => {
      // GIVEN
      const backoffGenerator = new BackoffGenerator({
        base,
        jitterDivisor: 1,
      });
      const interval = base * factor;

      // WHEN
      const promise = backoffGenerator.backoffJitter();
      jest.advanceTimersByTime(interval);
      await promise;

      // THEN
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), interval);
    });

    test('correctly calculates jitter with divisor', async () => {
      // GIVEN
      const jitterDivisor = 4;
      const backoffGenerator = new BackoffGenerator({
        base,
        jitterDivisor,
      });
      const interval = (base - base / jitterDivisor) + Math.floor(base / jitterDivisor * factor);

      // WHEN
      const promise = backoffGenerator.backoffJitter();
      jest.advanceTimersByTime(interval);
      await promise;

      // THEN
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), interval);
    });
  });
});
