/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnResource, IAspect, Stack } from 'aws-cdk-lib';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { LogRetention } from 'aws-cdk-lib/aws-logs';
import { IConstruct } from 'constructs';

export class LogRetentionRetryAspect implements IAspect {
  public visit(node: IConstruct): void {
    // Define log retention retries to reduce the risk of the rate exceed error
    // as the default create log group TPS is only 5. Make sure to set the timeout of log retention function
    // to be greater than total retry time. That's because if the function that is used for a custom resource
    // doesn't exit properly, it'd end up in retries and may take cloud formation an hour to realize that
    // the custom resource failed.
    if (node instanceof LogRetention) {
      const logRetentionResource = node.node.defaultChild as CfnResource;
      logRetentionResource.addPropertyOverride('SdkRetry', {
        maxRetries: 7,
        base: 200,
      });

      // referenced from cdk code: https://github.com/aws/aws-cdk/blob/v2.33.0/packages/@aws-cdk/aws-logs/lib/log-retention.ts#L116
      const logRetentionFunctionConstructId = 'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a';
      const logRetentionFunction = Stack.of(node).node.findChild(logRetentionFunctionConstructId);
      const cfnFunction = logRetentionFunction.node.defaultChild as CfnFunction;
      cfnFunction.addPropertyOverride('Timeout', 30);
    }
  }
}
