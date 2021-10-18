/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export {};

declare global {
  namespace jest {
    interface Matchers<R> {
      /**
       * Asserts that `pattern` matches a string exactly `count` times.
       * @param pattern The pattern to match.
       * @param count The number of times the pattern should match the string.
       */
      toMatchTimes(pattern: RegExp| string, count: number): R;
    }
  }
}
expect.extend({
  toMatchTimes(received: any, pattern: RegExp | string, count: number) {
    if (typeof received !== 'string') {
      throw new Error(`Expected input to be a string, but got ${typeof received}`);
    }
    const matchCount = received.match(pattern)?.length ?? 0;
    const pass = matchCount === count;
    if (pass) {
      return {
        pass,
        message: () => `expected the pattern ${pattern.toString()} to not match ${count} times, but matched ${matchCount} time(s) on input:\n${received}`,
      };
    } else {
      return {
        pass,
        message: () => `expected the pattern ${pattern.toString()} to match ${count} times, but matched ${matchCount} time(s) on input:\n${received}`,
      };
    }
  },
});
