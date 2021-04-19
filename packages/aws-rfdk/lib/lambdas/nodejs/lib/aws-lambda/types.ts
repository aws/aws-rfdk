/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * An interface that defines the AWSLambda context interface
 * This is the subset of properties that we need in our code; add to this
 * as you need/desire.
 *
 * Reference: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html
 */
export interface LambdaContext {
  readonly logGroupName: string;
  readonly logStreamName: string;
  getRemainingTimeInMillis?(): number;
}
