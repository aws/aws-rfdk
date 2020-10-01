/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import {
  VersionProvider,
  IVersionProviderProperties,
  IVersionedUris,
  Platform,
} from './version-provider';


export class VersionProviderResource extends SimpleCustomResource {
  readonly versionProvider: VersionProvider;

  constructor(indexFilePath?: string) {
    super();
    this.versionProvider = new VersionProvider(indexFilePath);
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public validateInput(data: object): boolean {
    return this.versionProvider.implementsIVersionProviderProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: IVersionProviderProperties): Promise<Map<Platform, IVersionedUris>> {
    return await this.versionProvider.getVersionUris(resourceProperties);
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: IVersionProviderProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }
}

/**
 * The handler used to provide the installer links for the requested version
 */
/* istanbul ignore next */
export async function handler(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const versionProvider = new VersionProviderResource();
  return await versionProvider.handler(event, context);
}
