/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
import * as path from 'path';

import { Ec2Service } from '@aws-cdk/aws-ecs';
import {
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import {
  Construct,
  CustomResource,
  Duration,
} from '@aws-cdk/core';
import { WaitForStableServiceResourceProps } from '../../lambdas/nodejs/wait-for-stable-service';

/**
 * Input properties for WaitForStableService.
 */
export interface WaitForStableServiceProps {
  /**
   * A service to wait for.
   */
  readonly service: Ec2Service;
}

/**
 * Depend on this construct to wait until the ECS Service becomes stable.
 * See https://docs.aws.amazon.com/cli/latest/reference/ecs/wait/services-stable.html.
 */
export class WaitForStableService extends Construct {
  constructor(scope: Construct, id: string, props: WaitForStableServiceProps) {
    super(scope, id);

    const lambdaRole = new Role(this, 'ECSWaitLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        describeServices: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                'ecs:DescribeServices',
              ],
              effect: Effect.ALLOW,
              resources: [props.service.cluster.clusterArn, props.service.serviceArn],
            }),
          ],
        }),
      },
    });

    const waitingFunction = new LambdaFunction(this, 'ECSWait', {
      role: lambdaRole,
      description: `Used by a WaitForStableService ${this.node.addr} to wait until ECS service becomes stable`,
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'), {
      }),
      environment: {
        DEBUG: 'false',
      },
      runtime: Runtime.NODEJS_12_X,
      handler: 'wait-for-stable-service.wait',
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.ONE_WEEK,
    });

    const properties: WaitForStableServiceResourceProps = {
      cluster: props.service.cluster.clusterArn,
      services: [props.service.serviceArn],
      forceRun: this.forceRun(),
    };

    const resource = new CustomResource(this, 'Default', {
      serviceToken: waitingFunction.functionArn,
      resourceType: 'Custom::RFDK_WaitForStableService',
      properties,
    });

    // Prevents a race during a stack-update.
    resource.node.addDependency(lambdaRole);
    resource.node.addDependency(props.service);

    this.node.defaultChild = resource;
  }

  private forceRun(): string {
    return randomBytes(32).toString('base64').slice(0, 32);
  }
}
