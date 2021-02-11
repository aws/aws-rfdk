/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module contains an engine for simple CfnCustomResources.
 * Simple, in this context, is a CfnCustomResource for which:
 * 1. The 'Update' is only performed if the ResourceProperties of the 'Update'
 * differs from the OldResourceProperties;
 * 2. The PhysicalResourceId is always the sha256 hash of the ResourceProperties;
 * 3. The 'Update' is performed by doing a 'Create' on the ResourceProperties,
 * and letting a subsequent 'Delete' on the OldResourceProperties clean up its
 * resources.
 */

/* eslint-disable no-console */

import { LambdaContext } from '../aws-lambda';

import { calculateSha256Hash } from './hash';
import { CfnResponseStatus, sendCfnResponse } from './reply';
import { CfnRequestEvent } from './types';

/* istanbul ignore file */

export abstract class SimpleCustomResource {
  protected readonly debugMode: boolean;

  constructor() {
    // Optionally suppress debugging statements.
    this.debugMode = (process.env.DEBUG ?? 'false') === 'true';
    if (!this.debugMode) {
      console.debug = () => { };
    }
  }

  /**
   * Called by the handler on the given ResourceProperties to ensure that
   * we set up the CfnCustomResource input correctly.
   * @param data
   * @returns True if the given data is correctly formed.
   */
  public abstract validateInput(data: object): boolean;

  /**
   * Called to perform the 'Create' action. Either in response to a 'Create'
   * request, or a 'Update' request wherein the ResourceProperties & OldResourceProperties
   * differ.
   * @param physicalId A stable hash value derived from the value of ResourceProperties
   * @param resourceProperties The ResourceProperties given to the handler.
   * @returns The Data to send back to CloudFormation as attributes of this CfnCustomResource
   */
  public abstract async doCreate(physicalId: string, resourceProperties: object): Promise<object|undefined>;

  /**
   * Called to perform the 'Delete' action. There are three locations in the state-diagram
   * of CloudFormation where we will recieve a 'Delete' request.
   * 1. Normally, when the stack is being deleted.
   * 2. On the replaced OldResourceProperties if an 'Update' request changed the PhysicalResourceId
   *    of the resource, and the stack update was successful.
   * 3. On the new ResourceProperties if an 'Update' request changed the PhysicalResourceId
   *    of the resource, and the stack update was NOT successful. i.e. rollback
   * @param physicalId A stable hash value derived from the value of ResourceProperties
   * @param resourceProperties The ResourceProperties given to the handler.
   */
  public abstract async doDelete(physicalId: string, resourceProperties: object): Promise<void>;

  /**
   * Handler/engine for the CustomResource state machine. Users of this class should
   * instantiate the class, and then immediately call this function.
   * @param event The event passed to the lambda handler.
   * @param context The lambda context passed to the lambda handler.
   */
  public async handler(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
    let status: CfnResponseStatus = CfnResponseStatus.SUCCESS;
    let failReason: string | undefined;
    let cfnData: object | undefined;

    console.log(`Handling event: ${JSON.stringify(event)}`);
    const requestType: string = event.RequestType;
    const resourceProperties: object = event.ResourceProperties ?? {};
    const physicalId: string = calculateSha256Hash(resourceProperties);

    try {
      if (requestType === 'Create') {
        if (!this.validateInput(resourceProperties)) {
          throw Error(`Input did not pass validation check. Check log group "${context.logGroupName}" ` +
            `for log stream ${context.logStreamName} for additional information.`);
        }
        cfnData = await this.doCreate(physicalId, resourceProperties);
        console.debug(`Create data: ${JSON.stringify(cfnData)}`);
      } else if (requestType === 'Update') {
        if (!this.validateInput(resourceProperties)) {
          throw Error('Input did not pass validation check');
        }
        const oldResourceProperties: object = event.OldResourceProperties ?? {};
        const oldPhysicalId: string = calculateSha256Hash(oldResourceProperties);
        if (oldPhysicalId !== physicalId) {
          console.log('Doing Create -- ResourceProperties differ.');
          cfnData = await this.doCreate(physicalId, resourceProperties);
          console.debug(`Update data: ${JSON.stringify(cfnData)}`);
        }
      } else {
        await this.doDelete(physicalId, resourceProperties);
      }
    } catch (e) {
      // We want to always catch the exception for a CfnCustomResource CloudFormation
      // must be notified about the success/failure of the lambda at all times;
      // failure to notify results in a stuck stack that takes at least an hour to
      // timeout.
      status = CfnResponseStatus.FAILED;
      failReason = `${e.message}\n${e.stack}`;
    } finally {
      // Always send a response to CloudFormation, signal success or
      // failure based on whether or not we had an exception.
      await sendCfnResponse({
        event,
        context,
        status,
        reason: failReason,
        physicalId,
        data: cfnData,
      });
    }

    const response: string = `${status}` + (failReason ?? '');
    console.log(`Result: ${response}`);
    return response;
  }
}
