/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DistinguishedNameProps {
  readonly CN: string;
  readonly O?: string;
  readonly OU?: string;
}

export function implementsDistinguishedNameProps(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (!value.CN || typeof(value.CN) !== 'string') { return false; }
  for (const key of ['O', 'OU']) {
    if (value[key] && typeof(value[key]) !== 'string') { return false; }
  }
  return true;
}

export class DistinguishedName {
  public readonly CN: string;
  public readonly O?: string;
  public readonly OU?: string;

  constructor(props: DistinguishedNameProps) {
    this.CN = props.CN;
    this.O = props.O;
    this.OU = props.OU;
  }

  public toString(): string {
    let result: string = `/CN=${this.CN}`;
    if (this.O) {
      result = `${result}/O=${this.O}`;
    }
    if (this.OU) {
      result = `${result}/OU=${this.OU}`;
    }
    return result;
  }

  public isValid(): boolean {
    let valid: boolean = true;
    for (const value of Object.values(this)) {
      valid = valid && (value.indexOf('/') === -1);
    }
    return valid;
  }
}