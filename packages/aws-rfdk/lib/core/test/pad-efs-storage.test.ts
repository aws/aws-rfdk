/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CfnElement,
  Size,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  SecurityGroup,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  AccessPoint,
  FileSystem as EfsFileSystem,
} from 'aws-cdk-lib/aws-efs';
import {
  Function as LambdaFunction,
} from 'aws-cdk-lib/aws-lambda';
import {
  PadEfsStorage,
} from '../lib/pad-efs-storage';

describe('Test PadEfsStorage', () => {
  let app: App;
  let stack: Stack;
  let vpc: Vpc;
  let efsFS: EfsFileSystem;
  let accessPoint: AccessPoint;


  beforeEach(() => {
    app = new App();
    stack = new Stack(app);
    vpc = new Vpc(stack, 'Vpc');
    efsFS = new EfsFileSystem(stack, 'EFS', { vpc });
    accessPoint = new AccessPoint(stack, 'AccessPoint', {
      fileSystem: efsFS,
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      path: '/SpaceFillingFiles',
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
    });
  });

  test('Create with defaults', () => {
    // WHEN
    const pad = new PadEfsStorage(stack, 'PadEfs', {
      vpc,
      accessPoint,
      desiredPadding: Size.gibibytes(20),
    });
    const sg = pad.node.findChild('LambdaSecurityGroup') as SecurityGroup;
    const diskUsage = pad.node.findChild('DiskUsage') as LambdaFunction;
    const padFilesystem = pad.node.findChild('PadFilesystem') as LambdaFunction;

    // THEN
    Template.fromStack(stack).hasResource('AWS::Lambda::Function', {
      Properties: {
        FileSystemConfigs: [
          {
            Arn: stack.resolve(accessPoint.accessPointArn),
            LocalMountPath: '/mnt/efs',
          },
        ],
        Handler: 'pad-efs-storage.getDiskUsage',
        Runtime: 'nodejs18.x',
        Timeout: 300,
        VpcConfig: {
          SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
          SubnetIds: [
            {
              Ref: 'VpcPrivateSubnet1Subnet536B997A',
            },
            {
              Ref: 'VpcPrivateSubnet2Subnet3788AAA1',
            },
          ],
        },
      },
      DependsOn: Match.arrayWith([stack.getLogicalId(accessPoint.node.defaultChild as CfnElement)]),
    });
    Template.fromStack(stack).hasResource('AWS::Lambda::Function', {
      Properties: {
        FileSystemConfigs: [
          {
            Arn: stack.resolve(accessPoint.accessPointArn),
            LocalMountPath: '/mnt/efs',
          },
        ],
        Handler: 'pad-efs-storage.padFilesystem',
        Runtime: 'nodejs18.x',
        Timeout: 900,
        VpcConfig: {
          SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
          SubnetIds: [
            {
              Ref: 'VpcPrivateSubnet1Subnet536B997A',
            },
            {
              Ref: 'VpcPrivateSubnet2Subnet3788AAA1',
            },
          ],
        },
      },
      DependsOn: Match.arrayWith([stack.getLogicalId(accessPoint.node.defaultChild as CfnElement)]),
    });

    const lambdaRetryCatch = {
      Retry: [
        {
          ErrorEquals: [
            'Lambda.ClientExecutionTimeoutException',
            'Lambda.ServiceException',
            'Lambda.AWSLambdaException',
            'Lambda.SdkClientException',
          ],
          IntervalSeconds: 2,
          MaxAttempts: 6,
          BackoffRate: 2,
        },
      ],
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'Fail',
        },
      ],
    };
    Template.fromStack(stack).hasResourceProperties('AWS::StepFunctions::StateMachine', {
      DefinitionString: stack.resolve(JSON.stringify({
        StartAt: 'QueryDiskUsage',
        States: {
          QueryDiskUsage: {
            Next: 'BranchOnDiskUsage',
            ...lambdaRetryCatch,
            Type: 'Task',
            Comment: 'Determine the number of GB currently stored in the EFS access point',
            TimeoutSeconds: 300,
            ResultPath: '$.diskUsage',
            Resource: `arn:${stack.partition}:states:::lambda:invoke`,
            Parameters: {
              FunctionName: `${diskUsage.functionArn}`,
              Payload: {
                'desiredPadding.$': '$.desiredPadding',
                'mountPoint': '/mnt/efs',
              },
            },
          },
          GrowTask: {
            Next: 'QueryDiskUsage',
            ...lambdaRetryCatch,
            Type: 'Task',
            Comment: 'Add up to 20 numbered 1GB files to the EFS access point',
            TimeoutSeconds: 900,
            ResultPath: '$.null',
            Resource: `arn:${stack.partition}:states:::lambda:invoke`,
            Parameters: {
              FunctionName: `${padFilesystem.functionArn}`,
              Payload: {
                'desiredPadding.$': '$.desiredPadding',
                'mountPoint': '/mnt/efs',
              },
            },
          },
          BranchOnDiskUsage: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.diskUsage.Payload',
                NumericLessThanPath: '$.desiredPadding',
                Next: 'GrowTask',
              },
              {
                Variable: '$.diskUsage.Payload',
                NumericGreaterThanPath: '$.desiredPadding',
                Next: 'ShrinkTask',
              },
            ],
            Default: 'Succeed',
          },
          Succeed: {
            Type: 'Succeed',
          },
          ShrinkTask: {
            Next: 'Succeed',
            ...lambdaRetryCatch,
            Type: 'Task',
            Comment: 'Remove 1GB numbered files from the EFS access point to shrink the padding',
            TimeoutSeconds: 900,
            ResultPath: '$.null',
            Resource: `arn:${stack.partition}:states:::lambda:invoke`,
            Parameters: {
              FunctionName: `${padFilesystem.functionArn}`,
              Payload: {
                'desiredPadding.$': '$.desiredPadding',
                'mountPoint': '/mnt/efs',
              },
            },
          },
          Fail: {
            Type: 'Fail',
          },
        },
      })),
    });

    Template.fromStack(stack).hasResourceProperties('Custom::AWS', {
      Create: {
        'Fn::Join': [
          '',
          [
            '{"action":"startExecution","service":"StepFunctions","apiVersion":"2016-11-23","region":"',
            {
              Ref: 'AWS::Region',
            },
            '","physicalResourceId":{"responsePath":"executionArn"},"parameters":{"stateMachineArn":"',
            {
              Ref: 'PadEfsStateMachineDA538E87',
            },
            '","input":"{\\"desiredPadding\\":20}"}}',
          ],
        ],
      },
      Update: {
        'Fn::Join': [
          '',
          [
            '{"action":"startExecution","service":"StepFunctions","apiVersion":"2016-11-23","region":"',
            {
              Ref: 'AWS::Region',
            },
            '","physicalResourceId":{"responsePath":"executionArn"},"parameters":{"stateMachineArn":"',
            {
              Ref: 'PadEfsStateMachineDA538E87',
            },
            '","input":"{\\"desiredPadding\\":20}"}}',
          ],
        ],
      },
    });
  });

  test('Set desiredPadding', () => {
    // WHEN
    const desiredPadding = 200;
    new PadEfsStorage(stack, 'PadEfs', {
      vpc,
      accessPoint,
      desiredPadding: Size.gibibytes(desiredPadding),
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::AWS', {
      Create: {
        'Fn::Join': [
          '',
          Match.arrayWith([`","input":"{\\"desiredPadding\\":${desiredPadding}}"}}`]),
        ],
      },
      Update: {
        'Fn::Join': [
          '',
          Match.arrayWith([`","input":"{\\"desiredPadding\\":${desiredPadding}}"}}`]),
        ],
      },
    });
  });

  test('Throws on bad desiredPadding', () => {
    // GIVEN
    const pad = new PadEfsStorage(stack, 'PadEfs', {
      vpc,
      accessPoint,
      desiredPadding: Size.mebibytes(100), // not rounable to GiB
    });

    // THEN
    Annotations.fromStack(stack).hasError(`/${pad.node.path}`, 'Failed to round desiredSize to an integer number of GiB. The size must be in GiB.');
  });

  test('Provide SecurityGroup', () => {
    // GIVEN
    const sg = new SecurityGroup(stack, 'TestSG', {
      vpc,
    });

    // WHEN
    new PadEfsStorage(stack, 'PadEfs', {
      vpc,
      accessPoint,
      desiredPadding: Size.gibibytes(20),
      securityGroup: sg,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'pad-efs-storage.getDiskUsage',
      VpcConfig: {
        SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
      },
    });
    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'pad-efs-storage.padFilesystem',
      VpcConfig: {
        SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
      },
    });
  });

});
