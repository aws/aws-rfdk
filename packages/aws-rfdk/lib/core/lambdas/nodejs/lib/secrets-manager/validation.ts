/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Check whether the given string matches the SecretsManager ARN format.
 * arn:aws:secretsmanager:<Region>:<AccountId>:secret:OptionalPath/SecretName-6RandomCharacters
 * Reference:
 *   https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_iam-permissions.html#iam-resources
 * @param value
 */
export function isArn(value: string): boolean {
  return value.match(/arn:aws(?:-us-gov|-cn)?:secretsmanager:[-a-z0-9]*:[0-9]*:secret:.+/)?.length === 1;
}