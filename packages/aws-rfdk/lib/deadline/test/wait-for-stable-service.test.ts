/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  countResourcesLike,
  expect as cdkExpect,
  // countResources,
  haveResourceLike,
  objectLike,
  // objectLike,
  // arrayWith,
  // countResourcesLike,
} from '@aws-cdk/assert';
import { InstanceClass, InstanceSize, InstanceType, SubnetType } from '@aws-cdk/aws-ec2';
import {
  Cluster,
  ContainerImage,
  Ec2Service,
  Ec2TaskDefinition,
} from '@aws-cdk/aws-ecs';
import {
  App,
  Stack,
} from '@aws-cdk/core';
import { WaitForStableService } from '../lib/wait-for-stable-service';

describe('WaitForStableService', () => {
  let app: App;
  let stack: Stack;
  let isolatedStack: Stack;
  let cluster: Cluster;
  let taskDefinition: Ec2TaskDefinition;
  let service: Ec2Service;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'Stack');
    isolatedStack = new Stack(app, 'IsolatedStack');
    cluster = new Cluster(stack, 'Cluster');
    cluster.addCapacity('ASG', {
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
      minCapacity: 1,
      maxCapacity: 1,
    });
    taskDefinition = new Ec2TaskDefinition(stack, 'RCSTask');
    taskDefinition.addContainer('Test', {
      image: ContainerImage.fromAsset(__dirname),
      memoryLimitMiB: 7500,
    });
    service = new Ec2Service(stack, 'Service', {
      cluster,
      taskDefinition,
    });
  });

  test('creates a custom resource', () => {
    // WHEN
    new WaitForStableService(isolatedStack, 'WaitForStableService', {
      service,
    });

    // THEN
    cdkExpect(isolatedStack).to(haveResourceLike('Custom::RFDK_WaitForStableService', {
      cluster: isolatedStack.resolve(cluster.clusterArn),
      services: [isolatedStack.resolve(service.serviceArn)],
    }));
  });

  test('creates lambda correctly', () => {
    // WHEN
    new WaitForStableService(isolatedStack, 'WaitForStableService', {
      service,
    });

    cdkExpect(isolatedStack).to(countResourcesLike('AWS::Lambda::Function', 1, {
      Handler: 'wait-for-stable-service.wait',
      Environment: {
        Variables: {
          DEBUG: 'false',
        },
      },
      Runtime: 'nodejs12.x',
      Timeout: 900,
    }));
  });

  test('adds policies to the lambda role', () => {
    // WHEN
    new WaitForStableService(isolatedStack, 'WaitForStableService', {
      service,
    });

    // THEN
    cdkExpect(isolatedStack).to(haveResourceLike('AWS::IAM::Role', {
      ManagedPolicyArns: arrayWith(
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          ],
        },
      ),
      Policies: [{
        PolicyDocument: objectLike({
          Statement: [{
            Action: 'ecs:DescribeServices',
            Effect: 'Allow',
            Resource: arrayWith(
              isolatedStack.resolve(cluster.clusterArn),
              isolatedStack.resolve(service.serviceArn),
            ),
          }],
        }),
      }],
    }));
  });
});
