/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  countResources,
  countResourcesLike,
  expect as cdkExpect,
  expect as expectCDK,
  haveResourceLike,
  objectLike,
  ResourcePart,
} from '@aws-cdk/assert';
import {
  AmazonLinuxGeneration,
  InstanceType,
  MachineImage,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  App,
  Duration,
  Stack,
} from '@aws-cdk/core';
import {StaticPrivateIpServer} from '../lib';

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
    cdkExpect(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
      Properties: {
        MinSize: '1',
        MaxSize: '1',
        LifecycleHookSpecificationList: arrayWith(objectLike({
          DefaultResult: 'ABANDON',
          HeartbeatTimeout: 120,
          LifecycleHookName: 'NewStaticPrivateIpServer',
          LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
          NotificationMetadata: {
            'Fn::Join': arrayWith([
              '{\"eniId\":\"',
              {
                Ref: 'InstanceEniA230F5FE',
              },
              '\"}',
            ]),
          },
        })),
        Tags: arrayWith({
          Key: 'RfdkStaticPrivateIpServerGrantConditionKey',
          PropagateAtLaunch: true,
          Value: 'StackNameAttachEniToInstance83a5dca5db544aa485d28d419cdf85ceF20CDF73',
        }),
      },
      DependsOn: arrayWith(
        'AttachEniToInstance83a5dca5db544aa485d28d419cdf85ceAttachEniNotificationTopicc8b1e9a6783c4954b191204dd5e3b9e0695D3E7F', // The SNS Topic Subscription; this is key.
        'InstanceEniA230F5FE', // The NetWorkInterface. Also key.
      ),
    }, ResourcePart.CompleteDefinition));

    cdkExpect(stack).to(haveResourceLike('AWS::EC2::NetworkInterface', {
      Description: 'Static ENI for StackName/Instance',
      GroupSet: arrayWith({
        'Fn::GetAtt': [
          'InstanceAsgInstanceSecurityGroup2DB1DA8B',
          'GroupId',
        ],
      }),
    }));

    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Runtime: 'nodejs12.x',
      Description: 'Created by RFDK StaticPrivateIpServer to process instance launch lifecycle events in stack \'StackName\'. This lambda attaches an ENI to newly launched instances.',
    }));

    expectCDK(stack).to(haveResourceLike('AWS::KMS::Key', {
      UpdateReplacePolicy: 'Delete',
      DeletionPolicy: 'Delete',
    }, ResourcePart.CompleteDefinition));
    expectCDK(stack).to(haveResourceLike('AWS::KMS::Key', {
      KeyPolicy: {
        Statement: [
          {
            Action: 'kms:*',
            Effect: 'Allow',
            Principal: {
              AWS: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ':root',
                  ],
                ],
              },
            },
            Resource: '*',
          },
        ],
      },
      EnableKeyRotation: true,
    }));
    cdkExpect(stack).to(haveResourceLike('AWS::SNS::Topic', {
      DisplayName: 'For RFDK instance-launch notifications for stack \'StackName\'',
      KmsMasterKeyId: {
        'Fn::GetAtt': [
          'SNSEncryptionKey255e9e52ad034ddf8ff8274bc10d63d1EDF79FFE',
          'Arn',
        ],
      },
    }));

    cdkExpect(stack).to(haveResourceLike('AWS::SNS::Subscription', {
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
    }));

    // The Lambda's policy should allow ENI attachment & condition-limited CompleteLifecycle.
    cdkExpect(stack).to(haveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: arrayWith(
          objectLike({
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
          objectLike({
            Effect: 'Allow',
            Action: [
              'ec2:DescribeNetworkInterfaces',
              'ec2:AttachNetworkInterface',
            ],
            Resource: '*',
          }),
        ),
      },
    }));

    // Count singleton objects
    cdkExpect(stack).to(countResources('AWS::Lambda::Function', 2)); // Log retention & event handler.
    cdkExpect(stack).to(countResources('AWS::SNS::Topic', 1));
    cdkExpect(stack).to(countResourcesLike('AWS::IAM::Role', 1, {
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
    }));
    cdkExpect(stack).to(countResourcesLike('AWS::IAM::Policy', 1, {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
            ],
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [
                'SNSEncryptionKey255e9e52ad034ddf8ff8274bc10d63d1EDF79FFE',
                'Arn',
              ],
            },
          },
          {
            Action: 'sns:Publish',
            Effect: 'Allow',
            Resource: {
              Ref: 'AttachEniNotificationTopicc8b1e9a6783c4954b191204dd5e3b9e0F5D22665',
            },
          },
        ],
      },
    }));
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
    cdkExpect(stack).to(countResourcesLike('AWS::AutoScaling::AutoScalingGroup', 2, {
      Tags: arrayWith({
        Key: 'RfdkStaticPrivateIpServerGrantConditionKey',
        PropagateAtLaunch: true,
        Value: 'StackNameAttachEniToInstance83a5dca5db544aa485d28d419cdf85ceF20CDF73',
      }),
    }));

    // Count singleton objects
    cdkExpect(stack).to(countResources('AWS::Lambda::Function', 2)); // Log retention & event handler.
    cdkExpect(stack).to(countResources('AWS::SNS::Topic', 1));
    cdkExpect(stack).to(countResourcesLike('AWS::IAM::Role', 1, {
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
    }));
  });

  test('throw exception when no available subnets', () => {
    // THEN
    expect(() => {
      new StaticPrivateIpServer(stack, 'Instance', {
        vpc,
        instanceType: new InstanceType('t3.small'),
        machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE,
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
    cdkExpect(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
      CreationPolicy: {
        ResourceSignal: {
          Count: 1,
          Timeout: 'PT12H',
        },
      },
    }, ResourcePart.CompleteDefinition));
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
