/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  Ec2Service,
  Ec2TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import {
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import {
  WaitForStableService,
} from '../lib/wait-for-stable-service';
import { resourcePropertiesCountIs } from './test-helper';

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
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
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
    Template.fromStack(isolatedStack).hasResourceProperties('Custom::RFDK_WaitForStableService', {
      cluster: isolatedStack.resolve(cluster.clusterArn),
      services: [isolatedStack.resolve(service.serviceArn)],
    });
  });

  test('creates lambda correctly', () => {
    // WHEN
    new WaitForStableService(isolatedStack, 'WaitForStableService', {
      service,
    });

    resourcePropertiesCountIs(isolatedStack, 'AWS::Lambda::Function', {
      Handler: 'wait-for-stable-service.wait',
      Environment: {
        Variables: {
          DEBUG: 'false',
        },
      },
      Runtime: 'nodejs16.x',
      Timeout: 900,
    }, 1);
  });

  test('adds policies to the lambda role', () => {
    // WHEN
    new WaitForStableService(isolatedStack, 'WaitForStableService', {
      service,
    });

    // THEN
    Template.fromStack(isolatedStack).hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        isolatedStack.resolve(ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole').managedPolicyArn),
      ]),
      Policies: [{
        PolicyDocument: Match.objectLike({
          Statement: [{
            Action: 'ecs:DescribeServices',
            Effect: 'Allow',
            Resource: Match.arrayWith([
              isolatedStack.resolve(cluster.clusterArn),
              isolatedStack.resolve(service.serviceArn),
            ]),
          }],
        }),
      }],
    });
  });
});
