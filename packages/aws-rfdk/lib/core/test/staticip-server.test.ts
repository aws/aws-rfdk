/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  Duration,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  AmazonLinuxGeneration,
  InstanceType,
  MachineImage,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {StaticPrivateIpServer} from '../lib';
import {resourcePropertiesCountIs} from './test-helper';

describe('Test StaticIpServer', () => {
  let stack: Stack;
  let vpc: Vpc;

  beforeEach(() => {
    const app = new App();
    stack = new Stack(app, 'StackName');
    vpc = new Vpc(stack, 'Vpc');
  });

  test('basic setup', () => {
    // WHEN
    new StaticPrivateIpServer(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // THEN
    Template.fromStack(stack).hasResource('AWS::AutoScaling::AutoScalingGroup', {
      Properties: {
        MinSize: '1',
        MaxSize: '1',
        LifecycleHookSpecificationList: Match.arrayWith([
          Match.objectLike({
            DefaultResult: 'ABANDON',
            HeartbeatTimeout: 120,
            LifecycleHookName: 'NewStaticPrivateIpServer',
            LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
            NotificationMetadata: {
              'Fn::Join': [
                '',
                Match.arrayWith([
                  '{"eniId":"',
                  {
                    Ref: 'InstanceEniA230F5FE',
                  },
                  '"}',
                ]),
              ],
            },
          }),
        ]),
        Tags: Match.arrayWith([{
          Key: 'RfdkStaticPrivateIpServerGrantConditionKey',
          PropagateAtLaunch: true,
          Value: 'StackNameAttachEniToInstance83a5dca5db544aa485d28d419cdf85ceF20CDF73',
        }]),
      },
      DependsOn: Match.arrayWith([
        'AttachEniToInstance83a5dca5db544aa485d28d419cdf85ceAttachEniNotificationTopicc8b1e9a6783c4954b191204dd5e3b9e0695D3E7F', // The SNS Topic Subscription; this is key.
        'InstanceEniA230F5FE', // The NetWorkInterface. Also key.
      ]),
      UpdatePolicy: {
        AutoScalingScheduledAction: {
          IgnoreUnmodifiedGroupSizeProperties: true,
        },
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::NetworkInterface', {
      Description: 'Static ENI for StackName/Instance',
      GroupSet: Match.arrayWith([{
        'Fn::GetAtt': [
          'InstanceAsgInstanceSecurityGroup2DB1DA8B',
          'GroupId',
        ],
      }]),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Runtime: 'nodejs16.x',
      Description: 'Created by RFDK StaticPrivateIpServer to process instance launch lifecycle events in stack \'StackName\'. This lambda attaches an ENI to newly launched instances.',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'For RFDK instance-launch notifications for stack \'StackName\'',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'lambda',
      TopicArn: {
        Ref: 'AttachEniNotificationTopicc8b1e9a6783c4954b191204dd5e3b9e0F5D22665',
      },
      Endpoint: {
        'Fn::GetAtt': [
          'AttachEniToInstance83a5dca5db544aa485d28d419cdf85ce70724E62',
          'Arn',
        ],
      },
    });

    // The Lambda's policy should allow ENI attachment & condition-limited CompleteLifecycle.
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'autoscaling:CompleteLifecycleAction',
            Effect: 'Allow',
            Condition: {
              'ForAnyValue:StringEquals': {
                'autoscaling:ResourceTag/RfdkStaticPrivateIpServerGrantConditionKey': 'StackNameAttachEniToInstance83a5dca5db544aa485d28d419cdf85ceF20CDF73',
              },
            },
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':autoscaling:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':autoScalingGroup:*:autoScalingGroupName/*',
                ],
              ],
            },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Action: [
              'ec2:DescribeNetworkInterfaces',
              'ec2:AttachNetworkInterface',
            ],
            Resource: '*',
          }),
        ]),
      },
    });

    // Count singleton objects
    Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2); // Log retention & event handler.
    Template.fromStack(stack).resourceCountIs('AWS::SNS::Topic', 1);

    resourcePropertiesCountIs(stack, 'AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: {
              Service: 'autoscaling.amazonaws.com',
            },
          },
        ],
      },
    }, 1);
    resourcePropertiesCountIs(stack, 'AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'sns:Publish',
            Effect: 'Allow',
            Resource: {
              Ref: 'AttachEniNotificationTopicc8b1e9a6783c4954b191204dd5e3b9e0F5D22665',
            },
          },
        ],
      },
    }, 1);
  });

  test('creates singleton resources', () => {
    // WHEN
    new StaticPrivateIpServer(stack, 'Instance1', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    new StaticPrivateIpServer(stack, 'Instance2', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // THEN
    // Make sure both ASGs are tagged to allow CompleteLifeCycle by the singleton lambda.
    resourcePropertiesCountIs(stack, 'AWS::AutoScaling::AutoScalingGroup', {
      Tags: Match.arrayWith([{
        Key: 'RfdkStaticPrivateIpServerGrantConditionKey',
        PropagateAtLaunch: true,
        Value: 'StackNameAttachEniToInstance83a5dca5db544aa485d28d419cdf85ceF20CDF73',
      }]),
    }, 2);

    // Count singleton objects
    Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2); // Log retention & event handler.
    Template.fromStack(stack).resourceCountIs('AWS::SNS::Topic', 1);
    resourcePropertiesCountIs(stack, 'AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: {
              Service: 'autoscaling.amazonaws.com',
            },
          },
        ],
      },
    }, 1);
  });

  test('throw exception when no available subnets', () => {
    // THEN
    expect(() => {
      new StaticPrivateIpServer(stack, 'Instance', {
        vpc,
        instanceType: new InstanceType('t3.small'),
        machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          availabilityZones: ['dummy zone'],
        },
      });
    }).toThrowError(/Did not find any subnets matching/);
  });

  test('resource signal count', () => {
    // WHEN
    new StaticPrivateIpServer(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      resourceSignalTimeout: Duration.hours(12),
    });

    // THEN
    Template.fromStack(stack).hasResource('AWS::AutoScaling::AutoScalingGroup', {
      CreationPolicy: {
        ResourceSignal: {
          Count: 1,
          Timeout: 'PT12H',
        },
      },
    });
    expect(() => {
      new StaticPrivateIpServer(stack, 'InstanceFail', {
        vpc,
        instanceType: new InstanceType('t3.small'),
        machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        resourceSignalTimeout: Duration.seconds(12 * 60 * 60 + 1),
      });
    }).toThrowError('Resource signal timeout cannot exceed 12 hours.');
  });
});
