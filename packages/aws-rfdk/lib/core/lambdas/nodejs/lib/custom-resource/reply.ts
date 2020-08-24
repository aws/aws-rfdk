/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* istanbul ignore file */

/* eslint-disable no-console */

/**
 * This module contains a simple helper function for sending the expected Custom Resource
 * response to CloudFormation.
 */
import * as https from 'https';
import * as url from 'url';

import { LambdaContext } from '../aws-lambda';
import { CfnRequestEvent } from './types';

export enum CfnResponseStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export async function sendCfnResponse(args: {
  readonly event: CfnRequestEvent,
  readonly context: LambdaContext,
  readonly status: CfnResponseStatus,
  readonly reason?: string,
  readonly physicalId?: string,
  readonly data?: object,
}): Promise<void> {

  // Construct the CustomResource response.
  // See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html
  const responseObject = {
    Status: args.status,
    Reason: args.reason ?? `See CloudWatch Logs -- Group: '${args.context.logGroupName}'  Stream: '${args.context.logStreamName}'`,
    PhysicalResourceId: args.physicalId ?? args.context.logGroupName + args.context.logStreamName,
    StackId: args.event.StackId,
    RequestId: args.event.RequestId,
    LogicalResourceId: args.event.LogicalResourceId,
    Data: args.data,
  };
  const responseBody: string = JSON.stringify(responseObject);
  const responseHeaders = {
    'content-type': '',
    'content-length': responseBody.length,
  };

  console.log(`CfnResponse: ${responseBody}`);
  const parsedUrl = url.parse(args.event.ResponseURL);
  const requestPromise = new Promise((resolve, reject) => {
    try {
      const request = https.request({
        hostname: parsedUrl.host,
        path: parsedUrl.path,
        method: 'PUT',
        headers: responseHeaders,
      }, resolve);
      request.on('error', reject);
      request.write(responseBody);
      request.end();
    } catch (e) {
      reject(e);
    }
  });
  try {
    await requestPromise;
  } catch (e) {
    console.error(`Could not send CustomResource response: ${JSON.stringify(e)}`);
    throw e;
  }
}
