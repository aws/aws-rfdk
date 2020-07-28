/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  countResources,
  countResourcesLike,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  AutoScalingGroup,
  CfnAutoScalingGroup,
} from '@aws-cdk/aws-autoscaling';
import {
  IMetric,
  Metric,
} from '@aws-cdk/aws-cloudwatch';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  Connections,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {IApplicationLoadBalancerTarget} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IPolicy,
  Policy,
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Key,
} from '@aws-cdk/aws-kms';
import {
  App,
  CfnElement,
  Construct,
  Stack,
} from '@aws-cdk/core';

import {
  HealthMonitor,
  IMonitorableFleet,
} from '../lib';

let app: App;
let infraStack: Stack;
let hmStack: Stack;
let wfStack: Stack;
let vpc: IVpc;
let healthMonitor: HealthMonitor;

class TestMonitorableFleet extends Construct implements IMonitorableFleet {
  public readonly connections: Connections;
  public readonly targetCapacity: number;
  public readonly targetCapacityMetric: IMetric;
  public readonly targetScope: Construct;
  public readonly targetToMonitor: IApplicationLoadBalancerTarget;
  public readonly targetUpdatePolicy: IPolicy;

  constructor(scope: Construct, id: string, props: {
    vpc: IVpc,
    minCapacity?: number,
  }) {
    super(scope, id);

    const fleet = new AutoScalingGroup(this, 'ASG', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc: props.vpc,
      minCapacity: props.minCapacity,
    });

    this.connections = new Connections();
    this.targetCapacity = parseInt((fleet.node.defaultChild as CfnAutoScalingGroup).maxSize, 10);
    this.targetScope = this;
    this.targetToMonitor = fleet;
    this.targetCapacityMetric = new Metric({
      namespace: 'AWS/AutoScaling',
      metricName: 'GroupDesiredCapacity',
      dimensions: {
        AutoScalingGroupName: fleet.autoScalingGroupName,
      },
      label: 'GroupDesiredCapacity',
    });
    this.targetUpdatePolicy = new Policy(this, 'ASGUpdatePolicy', {
      statements: [new PolicyStatement({
        actions: ['autoscaling:UpdateAutoScalingGroup'],
        resources: [fleet.autoScalingGroupArn],
      })],
    });
  }
}

beforeEach(() => {
  app = new App();
  infraStack = new Stack(app, 'infraStack', {
    env: {
      region: 'us-east-1',
    },
  });

  hmStack = new Stack(app, 'hmStack', {
    env: {
      region: 'us-east-1',
    },
  });

  wfStack = new Stack(app, 'wfStack', {
    env: {
      region: 'us-east-1',
    },
  });

  vpc = new Vpc(infraStack, 'VPC');
});

test('validating default health monitor properties', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor', {
    vpc,
  });
  // THEN
  expectCDK(hmStack).notTo(haveResource('AWS::ElasticLoadBalancingV2::LoadBalancer'));
  expectCDK(hmStack).to(haveResourceLike('AWS::KMS::Key', {
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
        {
          Action: [
            'kms:Decrypt',
            'kms:GenerateDataKey',
          ],
          Effect: 'Allow',
          Principal: {
            Service: 'cloudwatch.amazonaws.com',
          },
          Resource: '*',
        },
      ],
    },
    Description: `This key is used to encrypt SNS messages for ${healthMonitor.node.uniqueId}.`,
    EnableKeyRotation: true,
  }));
  expectCDK(hmStack).to(haveResourceLike('AWS::SNS::TopicPolicy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'sns:Publish',
          Effect: 'Allow',
          Principal: {
            Service: 'cloudwatch.amazonaws.com',
          },
          Resource: {
            Ref: hmStack.getLogicalId(healthMonitor.unhealthyFleetActionTopic.node.defaultChild as CfnElement),
          },
          Sid: '0',
        },
      ],
    },
    Topics: [
      {
        Ref: hmStack.getLogicalId(healthMonitor.unhealthyFleetActionTopic.node.defaultChild as CfnElement),
      },
    ],
  }));
  expectCDK(hmStack).to(haveResourceLike('AWS::SNS::Topic', {
    KmsMasterKeyId: {
      Ref: `${hmStack.getLogicalId(healthMonitor.node.findChild('SNSEncryptionKey').node.defaultChild as CfnElement)}`,
    },
  }));
  expectCDK(hmStack).to(haveResource('AWS::Lambda::Function'));
  expectCDK(hmStack).to(haveResourceLike('AWS::SNS::Subscription', {
    Protocol: 'lambda',
    TopicArn: {
      Ref: `${infraStack.getLogicalId(healthMonitor.node.findChild('UnhealthyFleetTopic').node.defaultChild as CfnElement)}`,
    },
    Endpoint: {
      'Fn::GetAtt': [
        'unhealthyFleetTermination28bccf6aaa76478c9239e2f5bcc0254c8C612A5E',
        'Arn',
      ],
    },
  }));
});

test('validating health monitor properties while passing a key', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor', {
    vpc,
    encryptionKey: Key.fromKeyArn(hmStack, 'importedKey', 'arn:aws:kms:us-west-2:123456789012:key/testarn'),
  });
  // THEN
  expectCDK(hmStack).notTo(haveResource('AWS::ElasticLoadBalancingV2::LoadBalancer'));
  expectCDK(hmStack).notTo(haveResource('AWS::KMS::Key'));
  expectCDK(hmStack).to(haveResourceLike('AWS::SNS::Topic', {
    KmsMasterKeyId: 'testarn',
  }));
  expectCDK(hmStack).to(haveResource('AWS::Lambda::Function'));
  expectCDK(hmStack).to(haveResourceLike('AWS::SNS::Subscription', {
    Protocol: 'lambda',
    TopicArn: {
      Ref: `${infraStack.getLogicalId(healthMonitor.node.findChild('UnhealthyFleetTopic').node.defaultChild as CfnElement)}`,
    },
    Endpoint: {
      'Fn::GetAtt': [
        'unhealthyFleetTermination28bccf6aaa76478c9239e2f5bcc0254c8C612A5E',
        'Arn',
      ],
    },
  }));
});

test('validating the target with default health config', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor', {
    vpc,
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
  });

  healthMonitor.registerFleet(fleet, {});

  // THEN
  expectCDK(wfStack).to(haveResource('AWS::ElasticLoadBalancingV2::Listener'));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckIntervalSeconds: 300,
    HealthCheckPort: '8081',
    HealthCheckProtocol: 'HTTP',
    Port: 8081,
    Protocol: 'HTTP',
    TargetType: 'instance',
  }));
  expectCDK(wfStack).to(haveResource('AWS::CloudWatch::Alarm'));
});

test('validating the target with custom health config', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor', {
    vpc,
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
  });
  healthMonitor.registerFleet(fleet, {
    port: 7171,
  });

  // THEN
  expectCDK(wfStack).to(haveResource('AWS::ElasticLoadBalancingV2::Listener'));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckIntervalSeconds: 300,
    HealthCheckPort: '7171',
    HealthCheckProtocol: 'HTTP',
    Port: 8081,
    Protocol: 'HTTP',
    TargetType: 'instance',
  }));
  expectCDK(wfStack).to(haveResource('AWS::CloudWatch::Alarm'));
});

test('2 ASG gets registered to same LB', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor', {
    vpc,
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
  });
  healthMonitor.registerFleet(fleet, {port: 7171});

  const fleet2 = new TestMonitorableFleet(wfStack, 'workerFleet2', {
    vpc,
  });
  healthMonitor.registerFleet(fleet2, {port: 7171});

  // THEN
  expectCDK(hmStack).to(countResources('AWS::ElasticLoadBalancingV2::LoadBalancer', 1));
  expectCDK(wfStack).to(countResources('AWS::ElasticLoadBalancingV2::Listener', 2));
  expectCDK(wfStack).to(haveResource('AWS::ElasticLoadBalancingV2::Listener'));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckIntervalSeconds: 300,
    HealthCheckPort: '7171',
    HealthCheckProtocol: 'HTTP',
    Port: 8081,
    Protocol: 'HTTP',
    TargetType: 'instance',
  }));
  expectCDK(wfStack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanThreshold',
    EvaluationPeriods: 8,
    ActionsEnabled: true,
    DatapointsToAlarm: 8,
    Threshold: 0,
    TreatMissingData: 'notBreaching',
  }));
  expectCDK(wfStack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanThreshold',
    EvaluationPeriods: 1,
    ActionsEnabled: true,
    DatapointsToAlarm: 1,
    Threshold: 35,
    TreatMissingData: 'notBreaching',
  }));
});

test('validating LB target limit', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor2', {
    vpc,
    elbAccountLimits: [{
      name: 'targets-per-application-load-balancer',
      max: 50,
    }],
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
    minCapacity: 50,
  });
  healthMonitor.registerFleet(fleet, {});

  const fleet2 = new TestMonitorableFleet(wfStack, 'workerFleet2', {
    vpc,
    minCapacity: 50,
  });
  healthMonitor.registerFleet(fleet2, {});

  // THEN
  expectCDK(hmStack).to(countResourcesLike('AWS::ElasticLoadBalancingV2::LoadBalancer', 2, {
    Scheme: 'internal',
    Type: 'application',
  }));
  expectCDK(wfStack).to(countResources('AWS::ElasticLoadBalancingV2::Listener', 2));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 8081,
    Protocol: 'HTTP',
  }));
});

test('validating LB listener limit', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor2', {
    vpc,
    elbAccountLimits: [{
      name: 'listeners-per-application-load-balancer',
      max: 1,
    }, {
      name: 'target-groups-per-action-on-application-load-balancer',
      max: 1,
    }],
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
  });
  healthMonitor.registerFleet(fleet, {});

  const fleet2 = new TestMonitorableFleet(wfStack, 'workerFleet2', {
    vpc,
  });
  healthMonitor.registerFleet(fleet2, {});

  // THEN
  expectCDK(hmStack).to(countResourcesLike('AWS::ElasticLoadBalancingV2::LoadBalancer', 2, {
    Scheme: 'internal',
    Type: 'application',
  }));
  expectCDK(wfStack).to(countResources('AWS::ElasticLoadBalancingV2::Listener', 2));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 8081,
    Protocol: 'HTTP',
  }));
});

test('validating target group limit per lb', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor2', {
    vpc,
    elbAccountLimits: [{
      name: 'target-groups-per-application-load-balancer',
      max: 1,
    }],
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
  });
  healthMonitor.registerFleet(fleet, {});

  const fleet2 = new TestMonitorableFleet(wfStack, 'workerFleet2', {
    vpc,
  });
  healthMonitor.registerFleet(fleet2, {});

  // THEN
  expectCDK(hmStack).to(countResourcesLike('AWS::ElasticLoadBalancingV2::LoadBalancer', 2, {
    Scheme: 'internal',
    Type: 'application',
  }));
  expectCDK(wfStack).to(countResources('AWS::ElasticLoadBalancingV2::Listener', 2));
  expectCDK(wfStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 8081,
    Protocol: 'HTTP',
  }));
});

test('validating target limit exhaustion', () => {
  // WHEN
  healthMonitor = new HealthMonitor(hmStack, 'healthMonitor2', {
    vpc,
    elbAccountLimits: [{
      name: 'targets-per-application-load-balancer',
      max: 1,
    }],
  });

  const fleet = new TestMonitorableFleet(wfStack, 'workerFleet', {
    vpc,
    minCapacity: 2,
  });
  expect(() => {
    healthMonitor.registerFleet(fleet, {});
  }).toThrowError(/AWS service limit \"targets-per-application-load-balancer\" reached. Limit: 1/);
});