/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  ComparisonOperator,
  IAlarmAction,
  IMetric,
  MathExpression,
  TreatMissingData,
} from '@aws-cdk/aws-cloudwatch';
import {SnsAction} from '@aws-cdk/aws-cloudwatch-actions';
import {
  IConnectable,
  ISecurityGroup,
  IVpc,
  Port,
  SubnetSelection,
} from '@aws-cdk/aws-ec2';
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  IApplicationLoadBalancerTarget,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {IPolicy, IRole, Policy, ServicePrincipal} from '@aws-cdk/aws-iam';
import {IKey, Key} from '@aws-cdk/aws-kms';
import {Code, Runtime, SingletonFunction} from '@aws-cdk/aws-lambda';
import {ITopic, Topic} from '@aws-cdk/aws-sns';
import {LambdaSubscription} from '@aws-cdk/aws-sns-subscriptions';
import {
  Construct,
  Duration,
  IResource,
  Names,
  RemovalPolicy,
  ResourceEnvironment,
  Stack,
} from '@aws-cdk/core';

import {LoadBalancerFactory} from './load-balancer-manager';
import { Resource as RfdkResource } from './resource';
import {tagConstruct} from './runtime-info';

/**
 * Information about an Elastic Load Balancing resource limit for your AWS account.
 *
 * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_Limit.html
 */
export interface Limit {
  /**
   * The name of the limit. The possible values are:
   *
   * application-load-balancers
   * listeners-per-application-load-balancer
   * listeners-per-network-load-balancer
   * network-load-balancers
   * rules-per-application-load-balancer
   * target-groups
   * target-groups-per-action-on-application-load-balancer
   * target-groups-per-action-on-network-load-balancer
   * target-groups-per-application-load-balancer
   * targets-per-application-load-balancer
   * targets-per-availability-zone-per-network-load-balancer
   * targets-per-network-load-balancer
   */
  readonly name: string;

  /**
   * The maximum value of the limit.
   */
  readonly max: number;
}

/**
 * Interface for the fleet which can be registered to Health Monitor.
 * This declares methods to be implemented by different kind of fleets
 * like ASG, Spot etc.
 */
export interface IMonitorableFleet extends IConnectable {
  /**
   * This field expects the component of type IApplicationLoadBalancerTarget
   * which can be attached to Application Load Balancer for monitoring.
   *
   * eg. An AutoScalingGroup
   */
  readonly targetToMonitor: IApplicationLoadBalancerTarget;

  /**
   * This field expects the base capacity metric of the fleet against
   * which, the healthy percent will be calculated.
   *
   * eg.: GroupDesiredCapacity for an ASG
   */
  readonly targetCapacityMetric: IMetric;

  /**
   * This field expects a policy which can be attached to the lambda
   * execution role so that it is capable of suspending the fleet.
   *
   * eg.: autoscaling:UpdateAutoScalingGroup permission for an ASG
   */
  readonly targetUpdatePolicy: IPolicy;

  /**
   * This field expects the maximum instance count this fleet can have.
   *
   * eg.: maxCapacity for an ASG
   */
  readonly targetCapacity: number;

  /**
   * This field expects the scope in which to create the monitoring resource
   * like TargetGroups, Listener etc.
   */
  readonly targetScope: Construct;
}

/**
 * Interface for the Health Monitor.
 */
export interface IHealthMonitor extends IResource {
  /**
   * Attaches the load-balancing target to the ELB for instance-level
   * monitoring.
   *
   * @param monitorableFleet
   * @param healthCheckConfig
   */
  registerFleet(monitorableFleet: IMonitorableFleet, healthCheckConfig: HealthCheckConfig): void;
}

/**
 * Properties for configuring a health check
 */
export interface HealthCheckConfig {
  /**
   * The approximate time between health checks for an individual target.
   *
   * @default Duration.minutes(5)
   */
  readonly interval?: Duration;

  /**
   * The port that the health monitor uses when performing health checks on the targets.
   *
   * @default 8081
   */
  readonly port?: number;

  /**
   * The number of consecutive health check failures required before considering a target unhealthy.
   *
   * @default 3
   */
  readonly instanceUnhealthyThresholdCount?: number;

  /**
   * The number of consecutive health checks successes required before considering an unhealthy target healthy.
   *
   * @default 2
   */
  readonly instanceHealthyThresholdCount?: number;

  /**
   * The percent of healthy hosts to consider fleet healthy and functioning.
   *
   * @default 65%
   */
  readonly healthyFleetThresholdPercent?: number;
}

/**
 * Properties for the Health Monitor.
 */
export interface HealthMonitorProps {
  /**
   * VPC to launch the Health Monitor in.
   */
  readonly vpc: IVpc;

  /**
   * Describes the current Elastic Load Balancing resource limits for your AWS account.
   * This object should be the output of 'describeAccountLimits' API.
   *
   * @default default account limits for ALB is used
   *
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#describeAccountLimits-property
   */
  readonly elbAccountLimits?: Limit[];

  /**
   * A KMS Key, either managed by this CDK app, or imported.
   *
   * @default A new Key will be created and used.
   */
  readonly encryptionKey?: IKey;

  /**
   * Indicates whether deletion protection is enabled for the LoadBalancer.
   *
   * @default true
   *
   * Note: This value is true by default which means that the deletion protection is enabled for the
   * load balancer. Hence, user needs to disable it using AWS Console or CLI before deleting the stack.
   * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#deletion-protection
   */
  readonly deletionProtection?: boolean;

  /**
   * Any load balancers that get created by calls to registerFleet() will be created in these subnets.
   *
   * @default: The VPC default strategy
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Security group for the health monitor. This is security group is associated with the health monitor's load balancer.
   *
   * @default: A security group is created
   */
  readonly securityGroup?: ISecurityGroup;
}

/**
 *  A new or imported Health Monitor.
 */
abstract class HealthMonitorBase extends RfdkResource implements IHealthMonitor {
  /**
   * Attaches the load-balancing target to the ELB for instance-level
   * monitoring.
   *
   * @param monitorableFleet
   * @param healthCheckConfig
   */
  public abstract registerFleet(monitorableFleet: IMonitorableFleet, healthCheckConfig: HealthCheckConfig): void;
}

/**
 * This construct is responsible for the deep health checks of compute instances.
 * It also replaces unhealthy instances and suspends unhealthy fleets.
 * Although, using this constructs adds up additional costs for monitoring,
 * it is highly recommended using this construct to help avoid / minimize runaway costs for compute instances.
 *
 * An instance is considered to be unhealthy when:
 *   1) Deadline client is not installed on it;
 *   2) Deadline client is installed but not running on it;
 *   3) RCS is not configured correctly for Deadline client;
 *   4) it is unable to connect to RCS due to any infrastructure issues;
 *   5) the health monitor is unable to reach it because of some infrastructure issues.
 *
 * A fleet is considered to be unhealthy when:
 *   1) at least 1 instance is unhealthy for the configured grace period;
 *   2) a percentage of unhealthy instances in the fleet is above a threshold at any given point of time.
 *
 * This internally creates an array of application load balancers and attaches
 * the worker-fleet (which internally is implemented as an Auto Scaling Group) to its listeners.
 * There is no load-balancing traffic on the load balancers,
 * it is only used for health checks.
 * Intention is to use the default properties of laod balancer health
 * checks which does HTTP pings at frequent intervals to all the
 * instances in the fleet and determines its health. If any of the
 * instance is found unhealthy, it is replaced. The target group
 * also publishes the unhealthy target count metric which is used
 * to identify the unhealthy fleet.
 *
 * Other than the default instance level protection, it also creates a lambda
 * which is responsible to set the fleet size to 0 in the event of a fleet
 * being sufficiently unhealthy to warrant termination.
 * This lambda is triggered by CloudWatch alarms via SNS (Simple Notification Service).
 *
 * ![architecture diagram](/diagrams/core/HealthMonitor.svg)
 *
 * Resources Deployed
 * ------------------------
 * - Application Load Balancer(s) doing frequent pings to the workers.
 * - An Amazon Simple Notification Service (SNS) topic for all unhealthy fleet notifications.
 * - An AWS Key Management Service (KMS) Key to encrypt SNS messages - If no encryption key is provided.
 * - An Amazon CloudWatch Alarm that triggers if a worker fleet is unhealthy for a long period.
 * - Another CloudWatch Alarm that triggers if the healthy host percentage of a worker fleet is lower than allowed.
 * - A single AWS Lambda function that sets fleet size to 0 when triggered in response to messages on the SNS Topic.
 * - Execution logs of the AWS Lambda function are published to a log group in Amazon CloudWatch.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The AWS Lambda that is created by this construct to terminate unhealthy worker fleets has permission to
 *   UpdateAutoScalingGroup ( https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_UpdateAutoScalingGroup.html )
 *   on all of the fleets that this construct is monitoring. You should not grant any additional actors/principals the
 *   ability to modify or execute this Lambda.
 * - Execution of the AWS Lambda for terminating unhealthy workers is triggered by messages to the Amazon Simple
 *   Notification Service (SNS) Topic that is created by this construct. Any principal that is able to publish notification
 *   to this SNS Topic can cause the Lambda to execute and reduce one of your worker fleets to zero instances. You should
 *   not grant any additional principals permissions to publish to this SNS Topic.
 */
export class HealthMonitor extends HealthMonitorBase {

  /**
   * Default health check listening port
   */
  public static readonly DEFAULT_HEALTH_CHECK_PORT: number = 63415;

  /**
   * Resource Tracker in Deadline currently publish health status every 5 min, hence keeping this same
   */
  public static readonly DEFAULT_HEALTH_CHECK_INTERVAL: Duration = Duration.minutes(5);
  /**
   * Resource Tracker in Deadline currently determines host unhealthy in 15 min, hence keeping this count
   */
  public static readonly DEFAULT_UNHEALTHY_HOST_THRESHOLD: number = 3;
  /**
   * This is the minimum possible value of ALB health-check config, we want to mark worker healthy ASAP
   */
  public static readonly DEFAULT_HEALTHY_HOST_THRESHOLD: number = 2;
  /**
   * Since we are not doing any load balancing, this port is just an arbitrary port.
   */
  public static readonly LOAD_BALANCER_LISTENING_PORT: number = 8081;

  /**
   * This number is taken from Resource Tracker implementation. If a fleet's healthy percent
   * is less than this threshold at any given point of time, it is suspended.
   */
  private static readonly DEFAULT_HEALTHY_FLEET_THRESHOLD_PERCENT_HARD: number = 65;
  /**
   * This number is taken from Resource Tracker implementation. If a fleet has at least 1
   * unhealthy host for a period of 2 hours, it is suspended.
   */
  private static readonly DEFAULT_UNHEALTHY_FLEET_THRESHOLD_PERCENT_GRACE: number = 0;
  /**
   * This number is taken from Resource Tracker implementation. We monitor unhealthy fleet for immediate
   * termination for a period fo 5 minutes.
   */
  private static readonly DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_HARD: Duration = Duration.minutes(5);
  /**
   * In Resource Tracker, we evaluate the fleet's health for determining the grace period over a period
   * of 5 minutes. For the first unhealthy signal, a instance can take upto 10min (max), hence we are
   * setting this period to be 15.
   */
  private static readonly DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_GRACE: Duration = Duration.minutes(15);
  /**
   * This number is taken from Resource Tracker implementation. Fleet is terminated immediately if it
   * has unhealthy host percent above the hard limit.
   */
  private static readonly DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_HARD: number = 1;
  /**
   * This number is taken from Resource Tracker implementation. The grace period duration is 2 hours,
   * since the grace period is 15 minutes, we need continuous 8 data points crossing the threshold.
   */
  private static readonly DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_GRACE: number = 8;

  /**
   * @inheritdoc
   */
  public readonly stack: Stack;

  /**
   * @inheritdoc
   */
  public readonly env: ResourceEnvironment;

  /**
   * SNS topic for all unhealthy fleet notifications. This is triggered by
   * the grace period and hard terminations alarms for the registered fleets.
   *
   * This topic can be subscribed to get all fleet termination notifications.
   */
  public readonly unhealthyFleetActionTopic: ITopic;

  private readonly props: HealthMonitorProps;

  private readonly lbFactory: LoadBalancerFactory;

  private readonly unhealthyFleetActionLambda: SingletonFunction;

  private readonly alarmTopicAction: IAlarmAction;

  constructor(scope: Construct, id: string, props: HealthMonitorProps) {
    super(scope, id);
    this.stack = Stack.of(scope);
    this.env = {
      account: this.stack.account,
      region: this.stack.region,
    };
    this.props = props;

    this.lbFactory = new LoadBalancerFactory(this, props.vpc);

    const topicEncryptKey = props.encryptionKey || new Key(this, 'SNSEncryptionKey', {
      description: `This key is used to encrypt SNS messages for ${Names.uniqueId(this)}.`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // allow cloudwatch service to send encrypted messages
    topicEncryptKey.grant(new ServicePrincipal('cloudwatch.amazonaws.com'), 'kms:Decrypt', 'kms:GenerateDataKey');

    this.unhealthyFleetActionTopic = new Topic(this, 'UnhealthyFleetTopic', {
      masterKey: topicEncryptKey,
    });

    this.unhealthyFleetActionTopic.grantPublish(new ServicePrincipal('cloudwatch.amazonaws.com'));

    this.alarmTopicAction = new SnsAction(this.unhealthyFleetActionTopic);

    this.unhealthyFleetActionLambda = new SingletonFunction(this, 'UnhealthyFleetAction', {
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs', 'unhealthyFleetAction')),
      runtime: Runtime.NODEJS_12_X,
      handler: 'index.handler',
      lambdaPurpose: 'unhealthyFleetTermination',
      timeout: Duration.seconds(300),
      uuid: '28bccf6a-aa76-478c-9239-e2f5bcc0254c',
    });

    this.unhealthyFleetActionTopic.addSubscription(new LambdaSubscription(this.unhealthyFleetActionLambda));

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * Attaches the load-balancing target to the ELB for instance-level
   * monitoring. The ELB does frequent pings to the workers and determines
   * if a worker node is unhealthy. If so, it replaces the instance.
   *
   * It also creates an Alarm for healthy host percent and suspends the
   * fleet if the given alarm is breaching. It sets the maxCapacity
   * property of the auto-scaling group to 0. This should be
   * reset manually after fixing the issue.
   *
   * @param monitorableFleet
   * @param healthCheckConfig
   */
  public registerFleet(monitorableFleet: IMonitorableFleet, healthCheckConfig: HealthCheckConfig): void {

    const {loadBalancer, targetGroup} = this.lbFactory.registerWorkerFleet(
      monitorableFleet,
      healthCheckConfig,
      this.props);

    this.createFleetAlarms(monitorableFleet, healthCheckConfig, loadBalancer, targetGroup);
  }

  private createFleetAlarms(
    monitorableFleet: IMonitorableFleet,
    healthCheckConfig: HealthCheckConfig,
    loadBalancer: ApplicationLoadBalancer,
    targetGroup: ApplicationTargetGroup) {

    monitorableFleet.connections.allowFrom(loadBalancer,
      Port.tcp(healthCheckConfig.port || HealthMonitor.LOAD_BALANCER_LISTENING_PORT));

    const percentMetric = new MathExpression({
      label: 'UnhealthyHostPercent',
      expression: 'IF(fleetCapacity, 100*(unhealthyHostCount/fleetCapacity), 0)',
      usingMetrics: {
        unhealthyHostCount: targetGroup.metricUnhealthyHostCount({
          statistic: 'max',
        }),
        fleetCapacity: monitorableFleet.targetCapacityMetric,
      },
      period: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_HARD,
    });

    // When unhealthy fleet is more than healthyFleetThresholdPercent or 35% at any given period of 5 minutes
    const immediateTerminationAlarm = percentMetric.createAlarm(monitorableFleet.targetScope, 'UnhealthyFleetTermination', {
      treatMissingData: TreatMissingData.NOT_BREACHING,
      threshold: 100 - (healthCheckConfig.healthyFleetThresholdPercent || HealthMonitor.DEFAULT_HEALTHY_FLEET_THRESHOLD_PERCENT_HARD),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_HARD,
      datapointsToAlarm: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_HARD,
      actionsEnabled: true,
    });
    immediateTerminationAlarm.addAlarmAction(this.alarmTopicAction);

    // When at least one node is unhealthy over a period of 2 hours
    const percentMetricGracePeriod = new MathExpression({
      label: 'UnhealthyHostPercent',
      expression: 'IF(fleetCapacity, 100*(unhealthyHostCount/fleetCapacity), 0)',
      usingMetrics: {
        unhealthyHostCount: targetGroup.metricUnhealthyHostCount({
          statistic: 'max',
        }),
        fleetCapacity: monitorableFleet.targetCapacityMetric,
      },
      period: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_GRACE,
    });

    const gracePeriodTerminationAlarm = percentMetricGracePeriod.createAlarm(monitorableFleet.targetScope, 'UnhealthyFleetGracePeriod', {
      treatMissingData: TreatMissingData.NOT_BREACHING,
      threshold: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_THRESHOLD_PERCENT_GRACE,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_GRACE,
      datapointsToAlarm: HealthMonitor.DEFAULT_UNHEALTHY_FLEET_ALARM_PERIOD_THRESHOLD_GRACE,
      actionsEnabled: true,
    });
    gracePeriodTerminationAlarm.addAlarmAction(this.alarmTopicAction);

    (monitorableFleet.targetUpdatePolicy as Policy).attachToRole(this.unhealthyFleetActionLambda.role as IRole);
  }
}
