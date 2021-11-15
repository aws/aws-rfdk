/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AutoScalingGroup,
  Signals,
  UpdatePolicy,
} from '@aws-cdk/aws-autoscaling';
import {
  AmazonLinuxGeneration,
  Connections,
  IConnectable,
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  ISecurityGroup,
  IVpc,
  MachineImage,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Construct,
  Duration,
  Names,
  Stack,
  Tags,
} from '@aws-cdk/core';

import {
  CloudWatchConfigBuilder,
  CloudWatchAgent,
  IScriptHost,
  LogGroupFactory,
  LogGroupFactoryProps,
} from '.';
import { tagConstruct } from './runtime-info';


/**
 * Properties for constructing a `DeploymentInstance`
 */
export interface DeploymentInstanceProps {
  /**
   * The VPC that the instance should be launched in.
   */
  readonly vpc: IVpc;

  /**
   * The amount of time that CloudFormation should wait for the success signals before failing the create/update.
   *
   * @default 15 minutes
   */
  readonly executionTimeout?: Duration;

  /**
   * The instance type to deploy
   *
   * @default t3.small
   */
  readonly instanceType?: InstanceType;

  /**
   * An optional EC2 keypair name to associate with the instance
   *
   * @default no EC2 keypair is associated with the instance
   */
  readonly keyName?: string;

  /**
   * The log group name for streaming CloudWatch logs
   *
   * @default the construct ID is used
   */
  readonly logGroupName?: string;

  /**
   * Properties for setting up the DeploymentInstance's LogGroup in CloudWatch
   *
   * @default the LogGroup will be created with all properties' default values to the LogGroup: /renderfarm/<construct id>
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * The machine image to use.
   *
   * @default latest Amazon Linux 2 image
   */
  readonly machineImage?: IMachineImage;

  /**
   * A security group to associate with the DeploymentInstance
   *
   * @default A new security group is created for the DeploymentInstance
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * Whether the instance should self-terminate after the deployment succeeds
   *
   * @default true
   */
  readonly selfTerminate?: boolean;

  /**
   * The subnets to deploy the instance to
   *
   * @default private subnets
   */
  readonly vpcSubnets?: SubnetSelection;
}

/**
 * Deploys an instance that runs its user data on deployment, waits for that user data to succeed, and optionally
 * terminates itself afterwards.
 *
 * Resources Deployed
 * ------------------------
 * - Auto Scaling Group (ASG) with max capacity of 1 instance.
 * - IAM instance profile, IAM role, and IAM policy
 * - An Amazon CloudWatch log group that contains the instance cloud-init logs
 * - A Lambda Function to fetch and existing Log Group or create a new one
 * - IAM role and policy for the Lambda Function
 *
 * Security Considerations
 * ------------------------
 * - The instances deployed by this construct download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 */
export class DeploymentInstance extends Construct implements IScriptHost, IConnectable {
  /**
   * The tag key name used as an IAM condition to restrict autoscaling API grants
   */
  private static readonly ASG_TAG_KEY: string = 'resourceLogicalId';

  /**
   * How often the CloudWatch agent will flush its log files to CloudWatch
   */
  private static readonly CLOUDWATCH_LOG_FLUSH_INTERVAL: Duration = Duration.seconds(15);

  /**
   * The default timeout to wait for CloudFormation success signals before failing the resource create/update
   */
  private static readonly DEFAULT_EXECUTION_TIMEOUT = Duration.minutes(15);

  /**
   * Default prefix for a LogGroup if one isn't provided in the props.
   */
  private static readonly DEFAULT_LOG_GROUP_PREFIX: string = '/renderfarm/';

  /**
   * @inheritdoc
   */
  public readonly connections: Connections;

  /**
   * The auto-scaling group
   */
  protected readonly asg: AutoScalingGroup;

  constructor(scope: Construct, id: string, props: DeploymentInstanceProps) {
    super(scope, id);

    this.asg = new AutoScalingGroup(this, 'ASG', {
      instanceType: props.instanceType ?? InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      keyName: props.keyName,
      machineImage: props.machineImage ?? MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      minCapacity: 1,
      maxCapacity: 1,
      securityGroup: props.securityGroup,
      signals: Signals.waitForAll({
        timeout: props.executionTimeout ?? DeploymentInstance.DEFAULT_EXECUTION_TIMEOUT,
      }),
      updatePolicy: UpdatePolicy.replacingUpdate(),
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? {
        subnetType: SubnetType.PRIVATE,
      },
    });
    this.node.defaultChild = this.asg;

    this.connections = this.asg.connections;

    const logGroupName = props.logGroupName ?? id;
    this.configureCloudWatchAgent(this.asg, logGroupName, props.logGroupProps);

    if (props.selfTerminate ?? true) {
      this.configureSelfTermination();
    }
    this.asg.userData.addSignalOnExitCommand(this.asg);

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * Make the execution of the instance dependent upon another construct
   *
   * @param dependency The construct that should be dependended upon
   */
  public addExecutionDependency(dependency: any): void {
    if (Construct.isConstruct(dependency)) {
      this.asg.node.defaultChild!.node.addDependency(dependency);
    }
  }

  /**
   * @inheritdoc
   */
  public get osType() {
    return this.asg.osType;
  }

  /**
   * @inheritdoc
   */
  public get userData() {
    return this.asg.userData;
  }

  /**
   * @inheritdoc
   */
  public get grantPrincipal() {
    return this.asg.grantPrincipal;
  }

  /**
   * Adds UserData commands to configure the CloudWatch Agent running on the deployment instance.
   *
   * The commands configure the agent to stream the following logs to a new CloudWatch log group:
   *   - The cloud-init log
   *
   * @param asg The auto-scaling group
   * @param groupName The name of the Log Group, or suffix of the Log Group if `logGroupProps.logGroupPrefix` is
   *                  specified
   * @param logGroupProps The properties for LogGroupFactory to create or fetch the log group
   */
  private configureCloudWatchAgent(asg: AutoScalingGroup, groupName: string, logGroupProps?: LogGroupFactoryProps) {
    const prefix = logGroupProps?.logGroupPrefix ?? DeploymentInstance.DEFAULT_LOG_GROUP_PREFIX;
    const defaultedLogGroupProps = {
      ...logGroupProps,
      logGroupPrefix: prefix,
    };
    const logGroup = LogGroupFactory.createOrFetch(this, 'DeploymentInstanceLogGroupWrapper', groupName, defaultedLogGroupProps);

    logGroup.grantWrite(asg);

    const cloudWatchConfigurationBuilder = new CloudWatchConfigBuilder(DeploymentInstance.CLOUDWATCH_LOG_FLUSH_INTERVAL);

    cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
      'cloud-init-output',
      '/var/log/cloud-init-output.log');

    new CloudWatchAgent(this, 'CloudWatchAgent', {
      cloudWatchConfig: cloudWatchConfigurationBuilder.generateCloudWatchConfiguration(),
      host: asg,
    });
  }

  private configureSelfTermination() {
    // Add a policy to the ASG that allows it to modify itself. We cannot add the ASG name in resources as it will cause
    // cyclic dependency. Hence, using Condition Keys
    const tagCondition: { [key: string]: any } = {};
    tagCondition[`autoscaling:ResourceTag/${DeploymentInstance.ASG_TAG_KEY}`] = Names.uniqueId(this);

    Tags.of(this.asg).add(DeploymentInstance.ASG_TAG_KEY, Names.uniqueId(this));

    this.asg.addToRolePolicy(new PolicyStatement({
      actions: [
        'autoscaling:UpdateAutoScalingGroup',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: tagCondition,
      },
    }));

    // Following policy is required to read the aws tags within the instance
    this.asg.addToRolePolicy(new PolicyStatement({
      actions: [
        'ec2:DescribeTags',
      ],
      resources: ['*'],
    }));

    // wait for the log flush interval to make sure that all the logs gets flushed.
    // this wait can be avoided in future by using a life-cycle-hook on 'TERMINATING' state.
    const terminationDelay = Math.ceil(DeploymentInstance.CLOUDWATCH_LOG_FLUSH_INTERVAL.toMinutes({integral: false}));
    this.asg.userData.addOnExitCommands(`sleep ${terminationDelay}m`);

    // fetching the instance id and ASG name and then setting its capacity to 0
    this.asg.userData.addOnExitCommands(
      'TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 30" 2> /dev/null)',
      'INSTANCE="$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id  2> /dev/null)"',
      'ASG="$(aws --region ' + Stack.of(this).region + ' ec2 describe-tags --filters "Name=resource-id,Values=${INSTANCE}" "Name=key,Values=aws:autoscaling:groupName" --query "Tags[0].Value" --output text)"',
      'aws --region ' + Stack.of(this).region + ' autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 0 --max-size 0 --desired-capacity 0',
    );
  }
}
