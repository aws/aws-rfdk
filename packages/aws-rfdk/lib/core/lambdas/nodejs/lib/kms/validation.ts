/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Check whether the given string matches the KMS ARN format.
 * arn:aws:kms:<Region>?:<AccountId>?:key/<UUID>
 * Reference:
 *   https://docs.aws.amazon.com/kms/latest/developerguide/find-cmk-id-arn.html#find-cmk-arn-api
 */
export function isArn(value: string): boolean {
  return value.match(/arn:aws(?:-us-gov|-cn)?:kms:[-a-z0-9]*:[0-9]*:key\/[-a-f0-9]+/)?.length === 1;
}