/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { ECS } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import {
  CfnRequestEvent,
  SimpleCustomResource,
} from '../lib/custom-resource';

export interface WaitForStableServiceResourceProps {
  /**
   * The short name or full Amazon Resource Name (ARN) of the cluster that hosts the service to describe.
   */
  readonly cluster: string,
  /**
   * A list of services to describe. You may specify up to 10 services to describe in a single operation.
   */
  readonly services: string[],

  /**
   * A random string that forces the Lambda to run again and check if ECS is stable.
   */
  readonly forceRun?: string;
};

/**
 * A custom resource used to save Spot Event Plugin server data and configurations.
 */
export class WaitForStableServiceResource extends SimpleCustomResource {
  protected readonly ecsClient: ECS;

  constructor(ecsClient: ECS) {
    super();
    this.ecsClient = ecsClient;
  }

  /**
   * @inheritdoc
   */
  public validateInput(data: object): boolean {
    return this.implementsWaitForStableServiceResourceProps(data);
  }

  /**
   * @inheritdoc
   */
  public async doCreate(_physicalId: string, resourceProperties: WaitForStableServiceResourceProps): Promise<object|undefined> {
    const options = {
      services: resourceProperties.services,
      cluster: resourceProperties.cluster,
    };

    try {
      console.log(`Waiting for ECS services to stabilize. Cluster: ${resourceProperties.cluster}. Services: ${resourceProperties.services}`);
      await this.ecsClient.waitFor('servicesStable', options).promise();
      console.log('Finished waiting. ECS services are stable.');
    } catch (e) {
      throw new Error(`ECS services failed to stabilize in expected time: ${e.code} -- ${e.message}`);
    }

    return undefined;
  }

  /**
   * @inheritdoc
   */
  public async doDelete(_physicalId: string, _resourceProperties: WaitForStableServiceResourceProps): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

  private implementsWaitForStableServiceResourceProps(value: any): value is WaitForStableServiceResourceProps {
    if (!value || typeof(value) !== 'object' || Array.isArray(value)) { return false; }
    if (!value.cluster || typeof(value.cluster) !== 'string') { return false; }
    if (!value.services || !Array.isArray(value.services)) { return false; }
    for (let service of value.services) {
      if (typeof(service) !== 'string') { return false; }
    }
    if (value.forceRun && typeof(value.forceRun) !== 'string') { return false; }
    return true;
  }
}

/**
 * The lambda handler that is used to log in to MongoDB and perform some configuration actions.
 */
/* istanbul ignore next */
export async function wait(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new WaitForStableServiceResource(new ECS());
  return await handler.handler(event, context);
}
