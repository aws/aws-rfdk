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
   * @default 1 - The entire backoff time is subject to jitter (i.e. "full jitter")
   */
  readonly jitterDivisor?: number;

  /**
   * The maximum amount of time, in milliseconds, to backoff before quitting.
   * @default No limit on how long this object can backoff for
   */
  readonly maxBackoffTimeMs?: number;

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
  private readonly jitterDivisor: number;
  private readonly maxBackoffTimeMs: number | undefined;
  private readonly maxAttempts: number | undefined;

  private sleepTime: number = 0;
  private attempt: number = 0;

  constructor(props?: BackoffGeneratorProps)
  {
    this.maxBackoffTimeMs = props?.maxBackoffTimeMs;
    this.maxAttempts = props?.maxAttempts;
    this.base = props?.base ?? 200;
    this.maxIntervalMs = props?.maxIntervalMs ?? Number.MAX_SAFE_INTEGER;

    this.jitterDivisor = props?.jitterDivisor ?? 1;
    if (this.jitterDivisor <= 0) {
      throw new Error(`jitterDivisor must be a postive integer, got: ${this.jitterDivisor}`);
    }

    // Initialize internal counters
    this.restart();
  }

  /**
   * Restarts the internal counters used by this class.
   */
  public restart(): void {
    this.sleepTime = 0;
    this.attempt = 0;
  }

  /**
   * Sleeps for an exponentially increasing time depending on how many times this class has backed off.
   */
  public async backoff(): Promise<void> {
    const interval = BackoffGenerator.calculateSleepMs(this.base, this.attempt, this.maxIntervalMs);

    await sleep(interval);
    this.sleepTime += interval;
    this.attempt++;
  }

  /**
   * Sleeps for an exponentially increasing time (with jitter) depending on how many times this class has backed off.
   */
  public async backoffJitter(): Promise<void> {
    const interval = BackoffGenerator.calculateSleepMs(this.base, this.attempt, this.maxIntervalMs);
    const intervalJitter = (interval - interval / this.jitterDivisor) + (Math.floor(interval / this.jitterDivisor * Math.random()));

    await sleep(intervalJitter);
    this.sleepTime += intervalJitter;
    this.attempt++;
  }

  /**
   * Returns true if either the maximum number of attempts or maximum time span has been reached.
   * If neither are specified, this will always return true.
   */
  public shouldContinue(): boolean {
    return ( this.maxAttempts === undefined || this.attempt < this.maxAttempts ) &&
           ( this.maxBackoffTimeMs === undefined || this.sleepTime < this.maxBackoffTimeMs );
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
