/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Properties for BackoffGenerator.
 */
export interface BackoffGeneratorProps {
  /**
   * The base duration, in milliseconds, used to calculate exponential backoff.
   *
   * For example, when not using jitter, the backoff time per attempt will be calculated as:
   * 1. `base` * 2^0
   * 2. `base` * 2^1
   * 3. `base` * 2^2, etc.
   *
   * @default 200 milliseconds
   */
  readonly base?: number;

  /**
   * The maximum amount of time, in milliseconds, allowed between backoffs.
   * Each backoff will have its length clamped to a maximum of this value.
   * @default Number.MAX_SAFE_INTEGER
   */
  readonly maxIntervalMs?: number;

  /**
   * The divisor used to calculate the portion backoff time that will be subject to jitter.
   * Higher values indicate lower jitters (backoff times will differ by a smaller amount).
   *
   * For example, given a calculated `backoff` value, applying jitter would look like:
   * ```
   * backoffJitter = (backoff - backoff / jitterDivisor) + jitter(backoff / jitterDivisor)
   * ```
   * @default No jitter
   */
  readonly jitterDivisor?: number;

  /**
   * The maximum cumulative time, in milliseconds, to backoff before quitting.
   * @default No limit on how long this object can backoff for
   */
  readonly maxCumulativeBackoffTimeMs?: number;

  /**
   * The maximum number of times to backoff before quitting.
   * @default No limit on how many times this object can backoff
   */
  readonly maxAttempts?: number;
}

/**
 * Class to handle sleeping with exponential backoff.
 *
 * Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
export class BackoffGenerator
{
  /**
   * Calculates the number of milliseconds to sleep based on the attempt count.
   * @param b The base value for the calculation.
   * @param attempt The attempt count.
   * @param maxIntervalMs The maximum interval between backoffs, in milliseconds.
   * @returns The number of milliseconds to sleep.
   */
  private static calculateSleepMs(b: number, attempt: number, maxIntervalMs: number): number {
    return Math.min(b * Math.pow(2, attempt), maxIntervalMs, Number.MAX_SAFE_INTEGER);
  }

  private readonly base: number;
  private readonly maxIntervalMs: number;
  private readonly jitterDivisor: number | undefined;
  private readonly maxCumulativeBackoffTimeMs: number | undefined;
  private readonly maxAttempts: number | undefined;

  private cumulativeBackoffTimeMs: number = 0;
  private attempt: number = 0;

  constructor(props?: BackoffGeneratorProps)
  {
    this.maxCumulativeBackoffTimeMs = props?.maxCumulativeBackoffTimeMs;
    this.maxAttempts = props?.maxAttempts;
    this.base = props?.base ?? 200;
    this.maxIntervalMs = props?.maxIntervalMs ?? Number.MAX_SAFE_INTEGER;

    this.jitterDivisor = props?.jitterDivisor;
    if (this.jitterDivisor !== undefined && this.jitterDivisor < 1) {
      throw new Error(`jitterDivisor must be greater than or equal to 1, got: ${this.jitterDivisor}`);
    }

    // Initialize internal counters
    this.restart();
  }

  /**
   * Restarts the internal counters used by this class.
   */
  public restart(): void {
    this.cumulativeBackoffTimeMs = 0;
    this.attempt = 0;
  }

  /**
   * Sleeps for an exponentially increasing time depending on how many times this class has backed off.
   * If `jitterDivisor` was provided, jitter will be applied to the backoff time.
   *
   * If any of the conditions to stop backing off are met, this method will not sleep and return false.
   * Otherwise, it sleeps and returns true.
   * @param force Force sleeping, regardless of the conditions that indicate when to stop backing off.
   */
  public async backoff(force?: boolean): Promise<boolean> {
    let interval = BackoffGenerator.calculateSleepMs(this.base, this.attempt, this.maxIntervalMs);

    if (this.jitterDivisor !== undefined) {
      interval = (interval - interval / this.jitterDivisor) + (Math.floor(interval / this.jitterDivisor * Math.random()));
    }

    const shouldContinue = this.shouldContinue();
    if (force || shouldContinue) {
      await sleep(interval);
      this.cumulativeBackoffTimeMs += interval;
      this.attempt++;
    }

    return shouldContinue;
  }

  /**
   * Returns true if either the maximum number of attempts or maximum cumulative backoff time has been reached.
   * If neither are specified, this will always return true.
   */
  public shouldContinue(): boolean {
    return ( this.maxAttempts === undefined || this.attempt < this.maxAttempts ) &&
           ( this.maxCumulativeBackoffTimeMs === undefined || this.cumulativeBackoffTimeMs < this.maxCumulativeBackoffTimeMs );
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
