/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  countResources,
  expect as expectCDK,
  haveResourceLike,
  ResourcePart,
  stringLike,
} from '@aws-cdk/assert';
import { CfnLaunchConfiguration } from '@aws-cdk/aws-autoscaling';
import {
  AmazonLinuxImage,
  ExecuteFileOptions,
  InstanceType,
  MachineImage,
  SecurityGroup,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { ILogGroup } from '@aws-cdk/aws-logs';
import { Bucket } from '@aws-cdk/aws-s3';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { StringParameter } from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';

import {
  DeploymentInstance,
  DeploymentInstanceProps,
} from '../lib/deployment-instance';
import { resourceTagMatcher, testConstructTags } from './tag-helpers';


const DEFAULT_CONSTRUCT_ID = 'DeploymentInstance';

/**
 * Machine image that spies on the following user data methods:
 *
 * * `.addOnExitCommands`
 * * `.addExecuteFileCommand`
 */
class AmazonLinuxWithUserDataSpy extends AmazonLinuxImage {
  public getImage(scope: cdk.Construct) {
    const result = super.getImage(scope);
    jest.spyOn(result.userData, 'addOnExitCommands');
    jest.spyOn(result.userData, 'addExecuteFileCommand');
    return result;
  }
}

describe('DeploymentInstance', () => {
  let app: cdk.App;
  let depStack: cdk.Stack;
  let stack: cdk.Stack;
  let vpc: Vpc;
  let target: DeploymentInstance;

  beforeAll(() => {
    // GIVEN
    app = new cdk.App();
    depStack = new cdk.Stack(app, 'DepStack');
    vpc = new Vpc(depStack, 'VPC');
  });

  describe('defaults', () => {

    beforeAll(() => {
      // GIVEN
      stack = new cdk.Stack(app, 'DefaultsStack');
      target = new DeploymentInstance(stack, DEFAULT_CONSTRUCT_ID, {
        vpc,
      });
    });

    describe('Auto-Scaling Group', () => {
      // Only one ASG is deployed. This is an anchor for the tests that follow. Each test is independent and not
      // guaranteed to match on the same resource in the CloudFormation template. Having a test that asserts a single
      // ASG makes these assertions linked
      test('deploys a single Auto-Scaling Group', () => {
        // THEN
        expectCDK(stack).to(countResources('AWS::AutoScaling::AutoScalingGroup', 1));
      });

      test('MaxSize is 1', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          MaxSize: '1',
        }));
      });

      test('MinSize is 1', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          MinSize: '1',
        }));
      });

      test('uses private subnets', () => {
        // GIVEN
        const privateSubnetIDs = vpc.selectSubnets({ subnetType: SubnetType.PRIVATE }).subnetIds;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          VPCZoneIdentifier: arrayWith(
            ...stack.resolve(privateSubnetIDs),
          ),
        }));
      });

      test('waits 15 minutes for one signal', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike(
          'AWS::AutoScaling::AutoScalingGroup',
          {
            CreationPolicy: {
              ResourceSignal: {
                Count: 1,
                Timeout: 'PT15M',
              },
            },
          },
          ResourcePart.CompleteDefinition,
        ));
      });

      test('sets replacing update policy', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike(
          'AWS::AutoScaling::AutoScalingGroup',
          {
            UpdatePolicy: {
              AutoScalingReplacingUpdate: {
                WillReplace: true,
              },
              AutoScalingScheduledAction: {
                IgnoreUnmodifiedGroupSizeProperties: true,
              },
            },
          },
          ResourcePart.CompleteDefinition,
        ));
      });

      test('uses Launch Configuration', () => {
        // GIVEN
        const launchConfig = target.node.findChild('ASG').node.findChild('LaunchConfig') as CfnLaunchConfiguration;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
          LaunchConfigurationName: stack.resolve(launchConfig.ref),
        }));
      });
    });

    describe('Launch Configuration', () => {
      // Only one ASG is deployed. This is an anchor for the tests that follow. Each test is independent and not
      // guaranteed to match on the same resource in the CloudFormation template. Having a test that asserts a single
      // ASG makes these assertions linked
      test('deploys a single Launch Configuration', () => {
        // THEN
        expectCDK(stack).to(countResources('AWS::AutoScaling::LaunchConfiguration', 1));
      });

      test('uses latest Amazon Linux machine image', () => {
        // GIVEN
        const amazonLinux = MachineImage.latestAmazonLinux();
        const imageId: { Ref: string } = stack.resolve(amazonLinux.getImage(stack)).imageId;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
          ImageId: imageId,
        }));
      });

      test('uses t3.small', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
          InstanceType: 't3.small',
        }));
      });

      test('Uses created Security Group', () => {
        // GIVEN
        const securityGroup = (target
          .node.findChild('ASG')
          .node.findChild('InstanceSecurityGroup')
        ) as SecurityGroup;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
          SecurityGroups: [
            stack.resolve(securityGroup.securityGroupId),
          ],
        }));
      });

      test('depends on policy', () => {
        // GIVEN
        const policy = (
          target
            .node.findChild('ASG')
            .node.findChild('InstanceRole')
            .node.findChild('DefaultPolicy')
            .node.defaultChild
        ) as iam.CfnPolicy;

        // THEN
        expectCDK(stack).to(haveResourceLike(
          'AWS::AutoScaling::LaunchConfiguration',
          {
            DependsOn: arrayWith(
              stack.resolve(policy.logicalId),
            ),
          },
          ResourcePart.CompleteDefinition,
        ));
      });
    });

    describe('Security Group', () => {
      test('creates Security Group in the desired VPC', () => {
        // THEN
        expectCDK(stack).to(countResources('AWS::EC2::SecurityGroup', 1));
        expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
          VpcId: stack.resolve(vpc.vpcId),
        }));
      });
    });

    describe('ASG IAM role', () => {
      let instanceRole: iam.CfnRole;

      beforeAll(() => {
        // GIVEN
        instanceRole = (
          target
            .node.findChild('ASG')
            .node.findChild('InstanceRole')
            .node.defaultChild
        ) as iam.CfnRole;
      });

      test('creates an instance profile', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::InstanceProfile', {
          Roles: [
            { Ref: stack.getLogicalId(instanceRole) },
          ],
        }));
      });

      test('creates a role that can be assumed by EC2', () => {
        // GIVEN
        const servicePrincipal = new iam.ServicePrincipal('ec2.amazonaws.com');

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Role', {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Action: 'sts:AssumeRole',
                Effect: 'Allow',
                Principal: {
                  Service: stack.resolve(servicePrincipal.policyFragment.principalJson).Service[0],
                },
              },
            ],
          },
        }));
      });

      test('can signal to CloudFormation', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: 'cloudformation:SignalResource',
                Effect: 'Allow',
                Resource: { Ref: 'AWS::StackId' },
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can write to the log group', () => {
        // GIVEN
        const logGroup = target.node.findChild(`${DEFAULT_CONSTRUCT_ID}LogGroup`) as ILogGroup;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Effect: 'Allow',
                Resource: stack.resolve(logGroup.logGroupArn),
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can fetch the CloudWatch Agent install script', () => {
        // GIVEN
        const cloudWatchAgentScriptAsset = (
          target
            .node.findChild('CloudWatchConfigurationScriptAsset')
        ) as Asset;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Resource: stack.resolve([
                  cloudWatchAgentScriptAsset.bucket.bucketArn,
                  cloudWatchAgentScriptAsset.bucket.arnForObjects('*'),
                ]),
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can fetch the CloudWatch Agent configuration file SSM parameter', () => {
        // GIVEN
        const cloudWatchConfigSsmParam = (
          target
            .node.findChild('StringParameter')
        ) as StringParameter;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  'ssm:DescribeParameters',
                  'ssm:GetParameters',
                  'ssm:GetParameter',
                  'ssm:GetParameterHistory',
                ],
                Effect: 'Allow',
                Resource: stack.resolve(cloudWatchConfigSsmParam.parameterArn),
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can fetch the CloudWatch Agent installer from S3', () => {
        // GIVEN
        const cloudWatchAgentInstallerBucket = Bucket.fromBucketArn(depStack, 'CloudWatchAgentInstallerBucket', `arn:aws:s3:::amazoncloudwatch-agent-${stack.region}` );

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Resource: stack.resolve([
                  cloudWatchAgentInstallerBucket.bucketArn,
                  cloudWatchAgentInstallerBucket.arnForObjects('*'),
                ]),
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can fetch GPG installer from RFDK dependencies S3 bucket', () => {
        // GIVEN
        const rfdkExternalDepsBucket = Bucket.fromBucketArn(depStack, 'RfdkExternalDependenciesBucket', `arn:aws:s3:::rfdk-external-dependencies-${stack.region}` );

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Resource: stack.resolve([
                  rfdkExternalDepsBucket.bucketArn,
                  rfdkExternalDepsBucket.arnForObjects('*'),
                ]),
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });

      test('can scale the Auto-Scaling Group', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: 'autoscaling:UpdateAutoScalingGroup',
                Condition: {
                  StringEquals: { 'autoscaling:ResourceTag/resourceLogicalId': cdk.Names.uniqueId(target) },
                },
                Effect: 'Allow',
                Resource: '*',
              },
              // The instance determines its Auto-Scaling Group by reading the tag created on the instance by the EC2
              // Auto-Scaling service
              {
                Action: 'ec2:DescribeTags',
                Effect: 'Allow',
                Resource: '*',
              },
            ),
          },
          Roles: [
            stack.resolve(instanceRole.ref),
          ],
        }));
      });
    });

    describe('CloudWatch Agent config SSM parameter', () => {
      test('configures log group', () => {
        // GIVEN
        const logGroup = target.node.findChild(`${DEFAULT_CONSTRUCT_ID}LogGroup`) as ILogGroup;

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::SSM::Parameter', {
          Type: 'String',
          Value: {
            'Fn::Join': [
              '',
              arrayWith(
                '{"logs":{"logs_collected":{"files":{"collect_list":[{"log_group_name":"',
                stack.resolve(logGroup.logGroupName),
              ),
            ],
          },
        }));
      });

      test('configures cloud-init log', () => {
        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::SSM::Parameter', {
          Type: 'String',
          Value: {
            'Fn::Join': [
              '',
              arrayWith(
                stringLike('*"log_stream_name":"cloud-init-output-{instance_id}","file_path":"/var/log/cloud-init-output.log",*'),
              ),
            ],
          },
        }));
      });
    });

    describe('Tags resources with RFDK meta-data', () => {
      testConstructTags({
        constructName: 'DeploymentInstance',
        createConstruct: () => {
          return stack;
        },
        resourceTypeCounts: {
          'AWS::EC2::SecurityGroup': 1,
          'AWS::IAM::Role': 1,
          'AWS::AutoScaling::AutoScalingGroup': 1,
          'AWS::SSM::Parameter': 1,
        },
      });
    });

    // RFDK adds the resourceLogicalId tag to the Auto-Scaling Group in order to scope down the permissions of the
    // IAM policy given to the EC2 instance profile so that only that ASG can be scaled by the instance.
    test('Tagging for self-termination', () => {
      // THEN
      const matcher = resourceTagMatcher('AWS::AutoScaling::AutoScalingGroup', 'resourceLogicalId', cdk.Names.uniqueId(target));

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', matcher));
    });
  });

  describe('User Data', () => {
    beforeAll(() => {
      // GIVEN
      stack = new cdk.Stack(app, 'UserDataStack');

      // WHEN
      target = new DeploymentInstance(stack, 'DeploymentInstanceNew', {
        vpc,
        // a hack to be able to spy on the user data's "addOnExitCommand" and "addExecuteFileCommand" methods.
        machineImage: new AmazonLinuxWithUserDataSpy(),
      });
    });

    test('configures self-termination', () =>{
      // THEN
      expect(target.userData.addOnExitCommands).toHaveBeenCalledWith(
        'TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 30" 2> /dev/null)',
        'INSTANCE="$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id  2> /dev/null)"',
        `ASG="$(aws --region ${stack.region} ec2 describe-tags --filters "Name=resource-id,Values=\${INSTANCE}" "Name=key,Values=aws:autoscaling:groupName" --query "Tags[0].Value" --output text)"`,
        `aws --region ${stack.region} autoscaling update-auto-scaling-group --auto-scaling-group-name \${ASG} --min-size 0 --max-size 0 --desired-capacity 0`,
      );
    });

    test('configures CloudWatch Agent', () =>{
      // GIVEN
      const spy = target.userData.addExecuteFileCommand as jest.Mock<void, [ExecuteFileOptions]>;
      const cloudWatchConfigSsmParam = (
        target
          .node.findChild('StringParameter')
      ) as StringParameter;

      // THEN

      // Should have been called
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);

      // The first call...
      const executeFileOptions = spy.mock.calls[0][0];

      // Should have been called with arguments
      const args = executeFileOptions.arguments;
      expect(args).not.toBeUndefined();

      const splitArgs = args!.split(' ');
      // Should have three arguments
      expect(splitArgs).toHaveLength(3);

      // Specify the flag to install the CloudWatch Agent
      expect(splitArgs[0]).toEqual('-i');
      // Should pass the region
      expect(stack.resolve(splitArgs[1])).toEqual(stack.resolve(stack.region));
      // Should pass the SSM parameter containing the CloudWatch Agent configuration
      expect(stack.resolve(splitArgs[2])).toEqual(stack.resolve(cloudWatchConfigSsmParam.parameterName));
    });

  });

  describe('Custom::LogRetention.LogGroupName', () => {
    beforeEach(() => {
      // We need a clean construct tree, because the tests use the same construct ID
      app = new cdk.App();
      depStack = new cdk.Stack(app, 'DepStack');
      vpc = new Vpc(depStack, 'VPC');
      stack = new cdk.Stack(app, 'Stack');
    });

    // GIVEN
    test.each<[
      {
        // optional logging props of DeploymentInstance
        logGroupName?: string,
        logGroupPrefix?: string,
      },
      // expected final log group name
      string,
    ]>([
      [
        {},
        // defaults expected final log group name
        `/renderfarm/${DEFAULT_CONSTRUCT_ID}`,
      ],
      [
        { logGroupName: 'foo' },
        // expected final log group name
        '/renderfarm/foo',
      ],
      [
        {
          logGroupPrefix: 'logGroupPrefix',
        },
        // expected final log group name
        `logGroupPrefix${DEFAULT_CONSTRUCT_ID}`,
      ],
      [
        {
          logGroupName: 'logGroupName',
          logGroupPrefix: 'logGroupPrefix',
        },
        // expected final log group name
        'logGroupPrefixlogGroupName',
      ],
    ])('%s => %s', ({ logGroupName, logGroupPrefix }, expectedLogGroupName) => {
      // WHEN
      new DeploymentInstance(stack, DEFAULT_CONSTRUCT_ID, {
        vpc,
        logGroupName,
        logGroupProps: logGroupPrefix ? { logGroupPrefix } : undefined,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('Custom::LogRetention', {
        LogGroupName: expectedLogGroupName,
      }));
    });
  });

  // GIVEN
  test('uses specified instance type', () => {
    // GIVEN
    const instanceType = new InstanceType('c5.large');
    // We want an isolated stack to ensure expectCDK is only searching resources
    // synthesized by the specific DeploymentInstance stack
    stack = new cdk.Stack(app, 'InstanceTypeStack');

    // WHEN
    new DeploymentInstance(stack, DEFAULT_CONSTRUCT_ID, {
      vpc,
      instanceType,
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: instanceType.toString(),
    }));
  });

  describe('.selfTermination = false', () => {
    beforeAll(() => {
      // GIVEN
      stack = new cdk.Stack(app, 'SelfTerminationDisabledStack');
      // Spy on user data method calls
      const machineImage = new AmazonLinuxWithUserDataSpy();

      const deploymentInstanceProps: DeploymentInstanceProps = {
        vpc,
        selfTerminate: false,
        machineImage,
      };

      // WHEN
      target = new DeploymentInstance(stack, DEFAULT_CONSTRUCT_ID, deploymentInstanceProps);
    });

    test('does not add on-exit commands', () => {
      // THEN
      expect(target.userData.addOnExitCommands).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.stringMatching(/\baws\s+.*\bautoscaling\s+update-auto-scaling-group/),
      ]));
    });

    test('is not granted IAM permissions to scale the Auto-Scaling Group', () => {
      // GIVEN
      const instanceRole = (
        target
          .node.findChild('ASG')
          .node.findChild('InstanceRole')
          .node.defaultChild
      ) as iam.CfnRole;

      // THEN
      expectCDK(stack).notTo(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: arrayWith(
            {
              Action: 'autoscaling:UpdateAutoScalingGroup',
              Condition: {
                // This tag is added by RFDK to scope down the permissions of the policy for least-privilege
                StringEquals: { 'autoscaling:ResourceTag/resourceLogicalId': cdk.Names.uniqueId(target) },
              },
              Effect: 'Allow',
              Resource: '*',
            },
            // The instance determines its Auto-Scaling Group by reading the tag created on the instance by the EC2
            // Auto-Scaling service
            {
              Action: 'ec2:DescribeTags',
              Effect: 'Allow',
              Resource: '*',
            },
          ),
        },
        Roles: [
          stack.resolve(instanceRole.ref),
        ],
      }));
    });

    test('does not tag for self-termination', () => {
      // THEN
      const matcher = resourceTagMatcher('AWS::AutoScaling::AutoScalingGroup', 'resourceLogicalId', cdk.Names.uniqueId(target));

      // THEN
      expectCDK(stack).notTo(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', matcher));
    });
  });

  // GIVEN
  describe('.executionTimeout is specified', () => {
    const  executionTimeout = cdk.Duration.minutes(30);

    beforeAll(() => {
      // GIVEN
      // Use a clean stack to not pollute other stacks with resources
      stack = new cdk.Stack(app, 'ExecutionTimeout');
      const deploymentInstanceProps: DeploymentInstanceProps = {
        vpc,
        executionTimeout,
      };

      // WHEN
      new DeploymentInstance(stack, DEFAULT_CONSTRUCT_ID, deploymentInstanceProps);
    });

    // THEN
    test('AWS::AutoScaling::AutoScalingGroup creation policy signal timeout is set accordingly', () => {
      expectCDK(stack).to(haveResourceLike(
        'AWS::AutoScaling::AutoScalingGroup',
        {
          CreationPolicy: {
            ResourceSignal: {
              Count: 1,
              Timeout: executionTimeout.toIsoString(),
            },
          },
        },
        ResourcePart.CompleteDefinition,
      ));
    });
  });
});
