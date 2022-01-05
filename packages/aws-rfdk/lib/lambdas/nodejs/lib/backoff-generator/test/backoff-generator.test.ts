/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import { BackoffGenerator } from '../backoff-generator';

describe('BackoffGenerator', () => {
  const base = 100;

  beforeEach(() => {
    // Jest fake timers were upgraded from v26 to v27 and lots of our tests break.
    // Moving from the legacy timers to the modern ones breaks most of these tests, so for now
    // we're forcing the use of the old ones.
    jest.useFakeTimers('legacy');

    jest.spyOn(global, 'setTimeout');
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
      .toThrow(`jitterDivisor must be greater than or equal to 1, got: ${jitterDivisor}`);
  });

  test('stops when max attempts is reached', async () => {
    // GIVEN
    const maxAttempts = 2;
    const backoffGenerator = new BackoffGenerator({
      base,
      maxAttempts,
    });

    // WHEN
    let retvals = [];
    for (let i = 0; i < maxAttempts; i++) {
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base * Math.pow(2, i));
      const retval = await promise;
      retvals.push(retval);
    }

    // THEN
    retvals.slice(0, -1).forEach(retval => expect(retval).toBe(true));
    expect(retvals[retvals.length - 1]).toBe(false);
    expect(backoffGenerator.shouldContinue()).toBe(false);
  });

  test('stops when max cumulative backoff time is reached', async () => {
    // GIVEN
    const backoffGenerator = new BackoffGenerator({
      base,
      maxCumulativeBackoffTimeMs: base,
    });

    // WHEN
    const promise = backoffGenerator.backoff();
    jest.advanceTimersByTime(base);
    const retval = await promise;

    // THEN
    expect(retval).toBe(false);
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

  test('forces backoff', async () => {
    // GIVEN
    const backoffGenerator = new BackoffGenerator({
      base,
      maxAttempts: 0,
    });
    if (backoffGenerator.shouldContinue() !== false) {
      throw new Error('BackoffGenerator.shouldContinue did not return false when it was expected to. Please fix this unit test.');
    }

    // WHEN
    const promise = backoffGenerator.backoff(true);
    jest.advanceTimersByTime(base);
    await promise;

    // THEN
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), base);
  });

  describe('.restart()', () => {
    test('resets the number of attempts', async () => {
      // GIVEN
      const backoffGenerator = new BackoffGenerator({
        base,
        maxAttempts: 1,
      });
      // This reaches maxAttempts, shouldContinue() will return false
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base);
      await promise;
      if (backoffGenerator.shouldContinue() !== false) {
        throw new Error('BackoffGenerator.shouldContinue did not return false when it was expected to. Please fix this unit test.');
      }

      // WHEN
      backoffGenerator.restart();

      // THEN
      expect(backoffGenerator.shouldContinue()).toBe(true);
    });

    test('resets the cumulative backoff time', async () => {
      // GIVEN
      const backoffGenerator = new BackoffGenerator({
        base,
        maxCumulativeBackoffTimeMs: base,
      });
      // This reaches maxCumulativeBackoffTimeMs, shouldContinue() will return false
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base);
      await promise;
      if (backoffGenerator.shouldContinue() !== false) {
        throw new Error('BackoffGenerator.shouldContinue did not return false when it was expected to. Please fix this unit test.');
      }

      // WHEN
      backoffGenerator.restart();

      // THEN
      expect(backoffGenerator.shouldContinue()).toBe(true);
    });
  });

  describe('backs off and continues', () => {
    test('when there are remaining attempts', async () => {
      // GIVEN
      const backoffGenerator = new BackoffGenerator({
        base,
        maxAttempts: 2,
      });

      // WHEN
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base);
      const retval = await promise;

      // THEN
      // We have one more attempt left, it should continue
      expect(retval).toBe(true);
      expect(backoffGenerator.shouldContinue()).toBe(true);
    });

    test('when there is remaining cumulative backoff time', async () => {
      // GIVEN
      const backoffGenerator = new BackoffGenerator({
        base,
        maxCumulativeBackoffTimeMs: base + 1,
      });

      // WHEN
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(base);
      const retval = await promise;

      // THEN
      // We haven't reached max cumulative backoff time yet, it should continue
      expect(retval).toBe(true);
      expect(backoffGenerator.shouldContinue()).toBe(true);
    });
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
      const promise = backoffGenerator.backoff();
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
      const promise = backoffGenerator.backoff();
      jest.advanceTimersByTime(interval);
      await promise;

      // THEN
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), interval);
    });
  });
});
