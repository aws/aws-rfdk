/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  AutoScalingGroup,
  BlockDevice,
  CfnAutoScalingGroup,
  DefaultResult,
  LifecycleTransition,
} from '@aws-cdk/aws-autoscaling';
import {
  CfnNetworkInterface,
  Connections,
  IConnectable,
  IMachineImage,
  InstanceType,
  ISecurityGroup,
  IVpc,
  OperatingSystemType,
  SubnetSelection,
  UserData,
} from '@aws-cdk/aws-ec2';
import {
  Effect,
  IGrantable,
  IPrincipal,
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {Key} from '@aws-cdk/aws-kms';
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import {
  RetentionDays,
} from '@aws-cdk/aws-logs';
import {
  Topic,
} from '@aws-cdk/aws-sns';
import {
  LambdaSubscription,
} from '@aws-cdk/aws-sns-subscriptions';
import {
  CfnResource,
  Construct,
  Duration,
  Lazy,
  RemovalPolicy,
  Stack,
  Tags,
} from '@aws-cdk/core';


/**
 * Required and optional properties that define the construction of a {@link StaticPrivateIpServer}
 */
export interface StaticPrivateIpServerProps {
  /**
   * VPC in which to launch the instance.
   */
  readonly vpc: IVpc;

  /**
   * The type of instance to launch
   */
  readonly instanceType: InstanceType;

  /**
   * The AMI to launch the instance with.
   */
  readonly machineImage: IMachineImage;

  /**
   * Specifies how block devices are exposed to the instance. You can specify virtual devices and EBS volumes.
   *
   * Each instance that is launched has an associated root device volume, either an Amazon EBS volume or an instance store volume.
   * You can use block device mappings to specify additional EBS volumes or instance store volumes to attach to an instance when it is launched.
   *
   * @default Uses the block device mapping of the AMI.
   */
  readonly blockDevices?: BlockDevice[];

  /**
   * Name of the EC2 SSH keypair to grant access to the instance.
   *
   * @default No SSH access will be possible.
   */
  readonly keyName?: string;

  /**
   * The specific private IP address to assign to the Elastic Network Interface of this instance.
   *
   * @default An IP address is randomly assigned from the subnet.
   */
  readonly privateIpAddress?: string;

  /**
   * The length of time to wait for the instance to signal successful deployment
   * during the initial deployment, or update, of your stack.
   *
   * The maximum value is 12 hours.
   *
   * @default The deployment does not require a success signal from the instance.
   */
  readonly resourceSignalTimeout?: Duration;

  /**
   * An IAM role to associate with the instance profile that is assigned to this instance.
   * The role must be assumable by the service principal `ec2.amazonaws.com`
   *
   * @default A role will automatically be created, it can be accessed via the `role` property.
   */
  readonly role?: IRole;

  /**
   * The security group to assign to this instance.
   *
   * @default A new security group is created for this instance.
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * Specific UserData to use. UserData is a script that is run automatically by the instance the very first time that a new instance is started.
   *
   * The UserData may be mutated after creation.
   *
   * @default A UserData that is appropriate to the {@link machineImage}'s operating system is created.
   */
  readonly userData?: UserData;

  /**
   * Where to place the instance within the VPC.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;
}

/**
 * This construct provides a single instance, provided by an Auto Scaling Group (ASG), that
 * has an attached Elastic Network Interface (ENI) that is providing a private ip address.
 * This ENI is automatically re-attached to the instance if the instance is replaced
 * by the ASG.
 *
 * The ENI provides an unchanging private IP address that can always be used to connect
 * to the instance regardless of how many times the instance has been replaced. Furthermore,
 * the ENI has a MAC address that remains unchanged unless the ENI is destroyed.
 *
 * Essentially, this provides an instance with an unchanging private IP address that will
 * automatically recover from termination. This instance is suitable for use as an application server,
 * such as a license server, that must always be reachable by the same IP address.
 *
 * Resources Deployed
 * ------------------------
 * - Auto Scaling Group (ASG) with min & max capacity of 1 instance.
 * - Elastic Network Interface (ENI).
 * - Security Group for the ASG.
 * - Instance Role and corresponding IAM Policy.
 * - SNS Topic & Role for instance-launch lifecycle events -- max one of each per stack.
 * - Lambda function, with role, to attach the ENI in response to instance-launch lifecycle events -- max one per stack.
 *
 * Security Considerations
 * ------------------------
 * - The AWS Lambda that is deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by this Lambda.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The AWS Lambda that is deployed through this construct has broad IAM permissions to attach any Elastic
 *   Network Interface (ENI) to any instance. You should not grant any additional actors/principals the ability
 *   to modify or execute this Lambda.
 * - The SNS Topic that is deployed through this construct controls the execution of the Lambda discussed above.
 *   Principals that can publish messages to this SNS Topic will be able to trigger the Lambda to run. You should
 *   not allow any additional principals to publish messages to this SNS Topic.
 */
export class StaticPrivateIpServer extends Construct implements IConnectable, IGrantable {

  /**
   * The Auto Scaling Group that contains the instance this construct creates.
   */
  public readonly autoscalingGroup: AutoScalingGroup;

  /**
   * Allows for providing security group connections to/from this instance.
   */
  public readonly connections: Connections;

  /**
   * The principal to grant permission to. Granting permissions to this principal will grant
   * those permissions to the instance role.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * The type of operating system that the instance is running.
   */
  public readonly osType: OperatingSystemType;

  /**
   * The Private IP address that has been assigned to the ENI.
   */
  public readonly privateIpAddress: string;

  /**
   * The IAM role that is assumed by the instance.
   */
  public readonly role: IRole;

  /**
   * The UserData for this instance.
   * UserData is a script that is run automatically by the instance the very first time that a new instance is started.
   */
  public readonly userData: UserData;

  constructor(scope: Construct, id: string, props: StaticPrivateIpServerProps) {
    super(scope, id);

    const { subnets } = props.vpc.selectSubnets(props.vpcSubnets);
    if (subnets.length === 0) {
      throw new Error(`Did not find any subnets matching ${JSON.stringify(props.vpcSubnets)}. Please use a different selection.`);
    }
    const subnet = subnets[0];

    if (props.resourceSignalTimeout && props.resourceSignalTimeout.toSeconds() > (12 * 60 * 60)) {
      throw new Error('Resource signal timeout cannot exceed 12 hours.');
    }

    this.autoscalingGroup = new AutoScalingGroup(this, 'Asg', {
      minCapacity: 1,
      maxCapacity: 1,
      vpc: props.vpc,
      instanceType: props.instanceType,
      machineImage: props.machineImage,
      vpcSubnets: { subnets: [subnet] },
      blockDevices: props.blockDevices,
      keyName: props.keyName,
      resourceSignalCount: props.resourceSignalTimeout ? 1 : undefined,
      resourceSignalTimeout: props.resourceSignalTimeout,
      role: props.role,
      securityGroup: props.securityGroup,
      userData: props.userData,
    });
    this.connections = this.autoscalingGroup.connections;
    this.grantPrincipal = this.autoscalingGroup.grantPrincipal;
    this.osType = this.autoscalingGroup.osType;
    this.role = this.autoscalingGroup.role;
    this.userData = this.autoscalingGroup.userData;

    const scopePath = this.node.scopes.map(construct => construct.node.id).slice(1); // Slice to remove the unnamed <root> scope.
    const eni = new CfnNetworkInterface(this, 'Eni', {
      subnetId: subnet.subnetId,
      description: `Static ENI for ${scopePath.join('/')}`,
      groupSet: Lazy.listValue({ produce: () => this.connections.securityGroups.map(sg => sg.securityGroupId) }),
      privateIpAddress: props.privateIpAddress,
    });
    this.privateIpAddress = eni.attrPrimaryPrivateIpAddress;

    // We need to be sure that the ENI is created before the instance would be brought up; otherwise, we cannot attach it.
    (this.autoscalingGroup.node.defaultChild as CfnResource).addDependsOn(eni);

    this.attachEniLifecyleTarget(eni);

    this.node.defaultChild = this.autoscalingGroup.node.defaultChild;
  }

  /**
   * Set up an instance launch lifecycle action that will attach the eni to the single instance
   * in this construct's AutoScalingGroup when a new instance is launched.
   */
  protected attachEniLifecyleTarget(eni: CfnNetworkInterface) {
    // Note: The design of AutoScalingGroup life cycle notifications in CDK v1.49.1 is such that
    // using the provided AutoScalingGroup.addLifecycleHook() will result in a setup that misses
    // launch notifications for instances created when the ASG is created. This is because
    // it uses the separate CfnLifecycleHook resource to do it, and that resource references the
    // ASG ARN; i.e. it must be created after the ASG has an ARN... thus it can miss instance launches
    // when the ASG is first created.
    //
    // We work around this by using an escape-hatch to the L1 ASG to create our own notification from scratch.

    const eventHandler = this.setupLifecycleEventHandlerFunction();
    const { topic, role } = this.setupLifecycleNotificationTopic(eventHandler);

    // Ensure no race conditions that might prevent the lambda from being able to perform its required functions by making
    // the ASG depend on the creation of the SNS Subscription.
    // Note: The topic subscriptions are children of the lambda, and are given an id equal to the Topic's id.
    this.autoscalingGroup.node.defaultChild!.node.addDependency(eventHandler.node.findChild(topic.node.id));

    (this.autoscalingGroup.node.defaultChild as CfnAutoScalingGroup).lifecycleHookSpecificationList = [
      {
        defaultResult: DefaultResult.ABANDON,
        heartbeatTimeout: 120,
        lifecycleHookName: 'NewStaticPrivateIpServer',
        lifecycleTransition: LifecycleTransition.INSTANCE_LAUNCHING,
        notificationTargetArn: topic.topicArn,
        roleArn: role.roleArn,
        notificationMetadata: JSON.stringify({ eniId: eni.ref }),
      },
    ];
  }

  /**
   * Create, or fetch, the lambda function that will process instance-start lifecycle events from this construct.
   */
  protected setupLifecycleEventHandlerFunction(): LambdaFunction {
    const stack = Stack.of(this);

    // The SingletonFunction does not tell us when it's newly created vs. finding a pre-existing
    // one. So, we do our own singleton Function so that we know when it's the first creation, and, thus,
    // we must attach one-time permissions.
    const functionUniqueId = 'AttachEniToInstance' + this.removeHyphens('83a5dca5-db54-4aa4-85d2-8d419cdf85ce');
    let singletonPreExists: boolean = true;
    let eventHandler = stack.node.tryFindChild(functionUniqueId) as LambdaFunction;
    if (!eventHandler) {
      const handlerCode = Code.fromAsset(path.join(__dirname, '..', 'lambdas', 'nodejs', 'asg-attach-eni'), {
        exclude: ['**/*', '!index*'],
      });
      eventHandler = new LambdaFunction(stack, functionUniqueId, {
        code: handlerCode,
        handler: 'index.handler',
        runtime: Runtime.NODEJS_12_X,
        description: `Created by RFDK StaticPrivateIpServer to process instance launch lifecycle events in stack '${stack.stackName}'. This lambda attaches an ENI to newly launched instances.`,
        logRetention: RetentionDays.THREE_DAYS,
      });
      singletonPreExists = false;
    }

    // Note: We **cannot** reference the ASG's ARN in the lambda's policy. It would create a deadlock at deployment:
    //  Lambda policy waiting on ASG completion to get ARN
    //  -> lambda waiting on policy to be created
    //  -> ASG waiting on lambda to signal lifecycle continue for instance start
    //  -> back to the start of the cycle.
    // Instead we use resourcetags condition to limit the scope of the lambda.
    const tagKey = 'RfdkStaticPrivateIpServerGrantConditionKey';
    const tagValue = eventHandler.node.uniqueId;
    const grantCondition: { [key: string]: string } = {};
    grantCondition[`autoscaling:ResourceTag/${tagKey}`] = tagValue;
    Tags.of(this.autoscalingGroup).add(tagKey, tagValue);

    // Allow the lambda to complete the lifecycle action for only tagged ASGs.
    const iamCompleteLifecycle = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'autoscaling:CompleteLifecycleAction',
      ],
      resources: [
        `arn:${stack.partition}:autoscaling:${stack.region}:${stack.account}:autoScalingGroup:*:autoScalingGroupName/*`,
      ],
      conditions: {
        'ForAnyValue:StringEquals': grantCondition,
      },
    });
    eventHandler.role!.addToPolicy(iamCompleteLifecycle);

    if (!singletonPreExists) {
      // Allow the lambda to attach the ENI to the instance that was created.
      // Referencing: https://docs.aws.amazon.com/IAM/latest/UserGuide/list_amazonec2.html
      // Last-Accessed: July 2020
      // The ec2:DescribeNetworkInterfaces, and ec2:AttachNetworkInterface operations
      // do not support conditions, and do not support resource restriction.
      // So, we only attach the policy to the lambda function once; when we first create it.
      const iamEniAttach = new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ec2:DescribeNetworkInterfaces',
          'ec2:AttachNetworkInterface',
        ],
        resources: ['*'],
      });
      eventHandler.role!.addToPolicy(iamEniAttach);
    }

    return eventHandler;
  }

  /**
   * Create, or fetch, an SNS Topic to which we'll direct the ASG's instance-start lifecycle hook events. Also creates, or fetches,
   * the accompanying role that allows the lifecycle events to be published to the SNS Topic.
   * @param lambdaHandler The lambda singleton that will be processing the lifecycle events.
   * @returns { topic: Topic, role: Role }
   */
  protected setupLifecycleNotificationTopic(lambdaHandler: LambdaFunction): { [key: string]: any } {
    const stack = Stack.of(this);
    // We only need to have a single SNS topic & subscription set up to handle lifecycle events for *all* instances of this class.
    // We have to be careful, however, to ensure that our initial setup only happens once when we first add the topic and such
    // to this stack; otherwise, we will not be able to deploy more than one of these constructs in a stack.

    const notificationRoleUniqueId = 'AttachEniNotificationRole' + this.removeHyphens('a0376ff8-248e-4534-bf42-58c6ffa4d5b4');
    const notificationTopicUniqueId = 'AttachEniNotificationTopic' + this.removeHyphens('c8b1e9a6-783c-4954-b191-204dd5e3b9e0');
    let notificationTopic: Topic = (stack.node.tryFindChild(notificationTopicUniqueId) as Topic);
    let notificationRole: Role;
    if (!notificationTopic) {
      // First time creating the singleton Topic in this stack. Set it all up...

      notificationRole = new Role(stack, notificationRoleUniqueId, {
        assumedBy: new ServicePrincipal('autoscaling.amazonaws.com'),
      });

      const notificationTopicEncryptKeyUniqueId = 'SNSEncryptionKey' + this.removeHyphens('255e9e52-ad03-4ddf-8ff8-274bc10d63d1');
      const notificationTopicEncryptKey = new Key(stack, notificationTopicEncryptKeyUniqueId, {
        description: `This key is used to encrypt SNS messages for ${notificationTopicUniqueId}.`,
        enableKeyRotation: true,
        removalPolicy: RemovalPolicy.DESTROY,
        trustAccountIdentities: true,
      });

      notificationTopic = new Topic(stack, notificationTopicUniqueId, {
        displayName: `For RFDK instance-launch notifications for stack '${stack.stackName}'`,
        masterKey: notificationTopicEncryptKey,
      });

      notificationTopicEncryptKey.grant(notificationRole, 'kms:Decrypt', 'kms:GenerateDataKey');

      notificationTopic.addSubscription(new LambdaSubscription(lambdaHandler));
      notificationTopic.grantPublish(notificationRole);
    } else {
      notificationRole = stack.node.findChild(notificationRoleUniqueId) as Role;
    }

    return {
      topic: notificationTopic,
      role: notificationRole,
    };
  }

  /**
   * Convert a UUID into a string that's usable in a construct id.
   */
  private removeHyphens(x: string): string {
    return x.replace(/[-]/g, '');
  }
}
