/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  ISecurityGroup,
  IVpc,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  IAccessPoint,
} from '@aws-cdk/aws-efs';
import {
  Code,
  FileSystem as LambdaFilesystem,
  Function as LambdaFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import {
  RetentionDays,
} from '@aws-cdk/aws-logs';
import {
  Choice,
  Condition,
  Fail,
  InputType,
  StateMachine,
  Succeed,
}from '@aws-cdk/aws-stepfunctions';
import {
  LambdaInvoke,
} from '@aws-cdk/aws-stepfunctions-tasks';
import {
  Annotations,
  Construct,
  Duration,
  Size,
  SizeRoundingBehavior,
  Stack,
} from '@aws-cdk/core';
import {
  AwsSdkCall,
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from '@aws-cdk/custom-resources';
import {
  tagConstruct,
} from './runtime-info';

/**
 * Input properties for PadEfsStorage.
 */
export interface PadEfsStorageProps {
  /**
   * VPC in which the given access point is deployed.
   */
  readonly vpc: IVpc;

  /**
   * PadEfsStorage deploys AWS Lambda Functions that need to contact your Amazon EFS mount target(s).
   * To do this, AWS Lambda creates network interfaces in these given subnets in your VPC.
   * These can be any subnet(s) in your VPC that can route traffic to the EFS mount target(s).
   *
   * @default All private subnets
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Amazon EFS Access Point into which the filesystem padding files will be added. Files will
   * be added/removed from the root directory of the given access point.
   * We strongly recommend that you provide an access point that is for a dedicated padding-files
   * directory in your EFS filesystem, rather than the root directory or some other in-use directory
   * of the filesystem.
   */
  readonly accessPoint: IAccessPoint;
  /**
   * Security group for the AWS Lambdas created by this construct.
   *
   * @default Security group with no egress or ingress will be automatically created for each Lambda.
   */
  readonly securityGroup?: ISecurityGroup;

  /**
   * The desired total size, in GiB, of files stored in the access point directory.
   */
  readonly desiredPadding: Size;
}

/**
 * This construct provides a mechanism that adds 1GB-sized files containing only zero-bytes
 * to an Amazon EFS filesystem through a given Access Point to that filesystem. This is being
 * provided to give you a way to increase the baseline throughput of an Amazon EFS filesystem
 * that has been deployed in bursting throughput mode (see: https://docs.aws.amazon.com/efs/latest/ug/performance.html#throughput-modes).
 * This is most useful for your Amazon EFS filesystems that contain a very small amount of data and
 * have a baseline throughput that exceeds the throughput provided by the size of the filesystem.
 *
 * When deployed in bursting throughput mode, an Amazon EFS filesystem provides you with a baseline
 * throughput that is proportional to the amount of data stored in that filesystem. However, usage
 * of that filesystem is allowed to burst above that throughput; doing so consumes burst credits that
 * are associated with the filesystem. When all burst credits have been expended, then your filesystem
 * is no longer allowed to burst throughput and you will be limited in throughput to the greater of 1MiB/s
 * or the throughput dictated by the amount of data stored in your filesystem; the filesystem will be able
 * to burst again if it is able to accrue burst credits by staying below its baseline throughput for a time.
 *
 * Customers that deploy the Deadline Repository Filesystem on an Amazon EFS filesystem may find that
 * the filesystem does not contain sufficient data to meet the throughput needs of Deadline; evidenced by
 * a downward trend in EFS bursting credits over time. When bursting credits are expended, then the render
 * farm may begin to exhibit failure mode behaviors such as the RenderQueue dropping or refusing connections,
 * or becoming unresponsive.
 *
 * If you find that your Amazon EFS is depleting its burst credits and would like to increase the
 * amount of padding that has been added to it then you can either:
 * - Modify the value of the desired padding property of this construct and redeploy your infrastructure
 *   to force an update; or
 * - Manually invoke the AWS Step Function that has been created by this construct by finding it
 *   in your AWS Console (its name will be prefixed with "<id of this construct>StateMachine"), and
 *   then start an execution of the state machine with the following JSON document as input:
 *   { "desiredPadding": <number of GiB you want to store> }
 *
 * Warning: The implementation of this construct creates and starts an AWS Step Function to add the files
 * to the filesystem. The execution of this Step Function occurs asynchronously from your deployment. We recommend
 * verifying that the step function completed successfully via your Step Functions console.
 *
 * Resources Deployed
 * --------------------------
 * - Two AWS Lambda Functions, with roles, with full access to the given EFS Access Point.
 * - An Elastic Network Interface (ENI) for each Lambda Function in each of the selected VPC Subnets, so
 *   that the Lambda Functions can connect to the given EFS Access Point.
 * - An AWS Step Function to coordinate execution of the two Lambda Functions.
 * - Security Groups for each AWS Lambda Function.
 * - A CloudFormation custom resource that executes StepFunctions.startExecution on the Step Function
 *   whenever the stack containing this construct is created or updated.
 *
 * Security Considerations
 * ---------------------------
 * - The AWS Lambdas that are deployed through this construct will be created from a deployment package
 *   that is uploaded to your CDK bootstrap bucket during deployment. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by these Lambdas.
 *   We strongly recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket,
 *   or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - By default, the network interfaces created by this construct's AWS Lambda Functions have Security Groups
 *   that restrict egress access from the Lambda Function into your VPC such that the Lambda Functions can
 *   access only the given EFS Access Point.
 */
export class PadEfsStorage extends Construct {
  constructor(scope: Construct, id: string, props: PadEfsStorageProps) {
    super(scope, id);

    /*
    Implementation:
     This is implemented as an AWS Step Function that implements the following
     algorithm:
     try {
      du = diskUsage(<efs access point directory>)
      while (du != desiredPadding) {
        if (du < desiredPadding) {
          <grow padding by adding up to 20 1GB numbered files to the filesystem.>
        } else if (du > desiredPadding) {
          <delete 1GB numbered files from the filesystem to reduce the padding to the desired amount>
          // Note: We break here to prevent two separate invocations of the step function (e.g. accidental manual
          // invocations) from looping indefinitely. Without a break, one invocation trying to grow while another
          // tries to shrink will infinitely loop both -- the diskUsage will never settle on the value that either
          // invocation wants.
          break;
        }
        du = diskUsage(<efs access point directory>)
      }
      return success
    } catch (error) {
      return failure
    }
     */

    const diskUsageTimeout = Duration.minutes(5);
    const paddingTimeout = Duration.minutes(15);
    // Location in the lambda environment where the EFS will be mounted.
    const efsMountPoint = '/mnt/efs';

    let desiredSize;
    try {
      desiredSize = props.desiredPadding.toGibibytes({rounding: SizeRoundingBehavior.FAIL});
    } catch (err) {
      Annotations.of(this).addError('Failed to round desiredSize to an integer number of GiB. The size must be in GiB.');
    }

    const securityGroup = props.securityGroup ?? new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: false,
    });

    const lambdaProps: any = {
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs')),
      runtime: Runtime.NODEJS_14_X,
      logRetention: RetentionDays.ONE_WEEK,
      // Required for access point...
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      securityGroups: [ securityGroup ],
      filesystem: LambdaFilesystem.fromEfsAccessPoint(props.accessPoint, efsMountPoint),
    };

    const diskUsage = new LambdaFunction(this, 'DiskUsage', {
      description: 'Used by RFDK PadEfsStorage to calculate disk usage of an EFS access point',
      handler: 'pad-efs-storage.getDiskUsage',
      timeout: diskUsageTimeout,
      memorySize: 128,
      ...lambdaProps,
    });
    // Implicit reference should have been fine, but the lambda is unable to mount the filesystem if
    // executed before the filesystem has been fully formed. We shouldn't have the lambda created until
    // after the EFS is created.
    diskUsage.node.addDependency(props.accessPoint);

    const doPadding = new LambdaFunction(this, 'PadFilesystem', {
      description: 'Used by RFDK PadEfsStorage to add or remove numbered 1GB files in an EFS access point',
      handler: 'pad-efs-storage.padFilesystem',
      timeout: paddingTimeout,
      // Execution requires about 70MB for just the lambda, but the filesystem driver will use every available byte.
      // Larger sizes do not seem to make a difference on filesystem write performance.
      // Set to 256MB just to give a buffer.
      memorySize: 256,
      ...lambdaProps,
    });
    // Implicit reference should have been fine, but the lambda is unable to mount the filesystem if
    // executed before the filesystem has been fully formed. We shouldn't have the lambda created until
    // after the EFS is created.
    doPadding.node.addDependency(props.accessPoint);

    // Build the step function's state machine.
    const fail = new Fail(this, 'Fail');
    const succeed = new Succeed(this, 'Succeed');

    const diskUsageTask = new LambdaInvoke(this, 'QueryDiskUsage', {
      lambdaFunction: diskUsage,
      comment: 'Determine the number of GB currently stored in the EFS access point',
      timeout: diskUsageTimeout,
      payload: {
        type: InputType.OBJECT,
        value: {
          'desiredPadding.$': '$.desiredPadding',
          'mountPoint': efsMountPoint,
        },
      },
      resultPath: '$.diskUsage',
    });

    const growTask = new LambdaInvoke(this, 'GrowTask', {
      lambdaFunction: doPadding,
      comment: 'Add up to 20 numbered 1GB files to the EFS access point',
      timeout: paddingTimeout,
      payload: {
        type: InputType.OBJECT,
        value: {
          'desiredPadding.$': '$.desiredPadding',
          'mountPoint': efsMountPoint,
        },
      },
      resultPath: '$.null',
    });

    const shrinkTask = new LambdaInvoke(this, 'ShrinkTask', {
      lambdaFunction: doPadding,
      comment: 'Remove 1GB numbered files from the EFS access point to shrink the padding',
      timeout: paddingTimeout,
      payload: {
        type: InputType.OBJECT,
        value: {
          'desiredPadding.$': '$.desiredPadding',
          'mountPoint': efsMountPoint,
        },
      },
      resultPath: '$.null',
    });

    const choice = new Choice(this, 'BranchOnDiskUsage')
      .when(Condition.numberLessThanJsonPath('$.diskUsage.Payload', '$.desiredPadding'), growTask)
      .when(Condition.numberGreaterThanJsonPath('$.diskUsage.Payload', '$.desiredPadding'), shrinkTask)
      .otherwise(succeed);

    diskUsageTask.next(choice);
    diskUsageTask.addCatch(fail, {
      // See: https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html
      errors: ['States.ALL'],
    });

    growTask.next(diskUsageTask);
    growTask.addCatch(fail, {
      errors: [ 'States.ALL' ],
    });

    shrinkTask.next(succeed);
    shrinkTask.addCatch(fail, {
      errors: [ 'States.ALL' ],
    });

    const statemachine = new StateMachine(this, 'StateMachine', {
      definition: diskUsageTask,
    });

    // ==========
    // Invoke the step function on stack create & update.
    const invokeCall: AwsSdkCall = {
      action: 'startExecution',
      service: 'StepFunctions',
      apiVersion: '2016-11-23',
      region: Stack.of(this).region,
      physicalResourceId: PhysicalResourceId.fromResponse('executionArn'),
      parameters: {
        stateMachineArn: statemachine.stateMachineArn,
        input: JSON.stringify({
          desiredPadding: desiredSize,
        }),
      },
    };

    const resource = new AwsCustomResource(this, 'Default', {
      installLatestAwsSdk: true,
      logRetention: RetentionDays.ONE_WEEK,
      onCreate: invokeCall,
      onUpdate: invokeCall,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [ statemachine.stateMachineArn ],
      }),
    });
    resource.node.addDependency(statemachine);

    // Add RFDK tags to the construct tree.
    tagConstruct(this);
  }
}
