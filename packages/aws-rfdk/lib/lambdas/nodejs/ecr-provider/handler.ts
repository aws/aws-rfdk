/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';
import {
  ThinkboxEcrProvider,
} from '../lib/ecr-provider';

/**
 * The input to this Custom Resource
 */
export interface ThinkboxEcrProviderResourceProperties {
  /**
   * A random string that forces the Lambda to run again and obtain the latest ECR.
   */
  readonly ForceRun?: string;
}

/**
 * Output of this Custom Resource.
 */
export interface ThinkboxEcrProviderResourceOutput {
  /**
   * The URI prefix of the ECR repositories containing Deadline container images. This can be suffixed with the recipe
   * name to get a Deadline image's complete ECR repository URI.
   */
  readonly EcrURIPrefix: string;
}

/**
 * This custom resource will parse and return the base ECR ARN or URI containing Thinkbox published Docker Images.
 * A global ECR base URI is returned.
 */
export class ThinkboxEcrProviderResource extends SimpleCustomResource {
  readonly ecrProvider: ThinkboxEcrProvider;

  constructor() {
    super();
    this.ecrProvider = new ThinkboxEcrProvider();
  }

  /**
   * @inheritdoc
   */
  public validateInput(data: object): boolean {
    return this.isEcrProviderResourceProperties(data);
  }

  /**
   * @inheritdoc
   */
  public async doCreate(_physicalId: string, _resourceProperties: ThinkboxEcrProviderResourceProperties): Promise<ThinkboxEcrProviderResourceOutput> {
    const result = {
      EcrURIPrefix: await this.ecrProvider.getGlobalEcrBaseURI(),
    };
    console.log('result = ');
    console.log(JSON.stringify(result, null, 4));
    return result;
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */
  public async doDelete(_physicalId: string, _resourceProperties: ThinkboxEcrProviderResourceProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  private isEcrProviderResourceProperties(value: any): value is ThinkboxEcrProviderResourceProperties {
    if (!value || typeof(value) !== 'object' || Array.isArray(value)) { return false; }

    function isOptionalString(val: any): val is string | undefined {
      return val === undefined || typeof(val) == 'string';
    }

    return isOptionalString(value.ForceRun);
  }
}

/**
 * The handler used to provide the installer links for the requested version
 */
/* istanbul ignore next */
export async function handler(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const ecrProvider = new ThinkboxEcrProviderResource();
  return await ecrProvider.handler(event, context);
}
