/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isArn } from './validation';

export class Key {
  public static fromArn(arn: string) {
    return new Key(arn);
  }

  public readonly arn: string;

  protected constructor(arn: string) {
    if (!isArn(arn)) {
      throw Error(`Not a KMS ARN: ${arn}`);
    }
    this.arn = arn;
  }
}
