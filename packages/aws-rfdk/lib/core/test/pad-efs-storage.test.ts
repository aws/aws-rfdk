/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  anything,
  arrayWith,
  expect as cdkExpect,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  SecurityGroup,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  AccessPoint,
  FileSystem as EfsFileSystem,
} from '@aws-cdk/aws-efs';
import {
  App,
  Stack,
} from '@aws-cdk/core';
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
      desiredPaddingGB: 20,
    });
    const sg = pad.node.findChild('LambdaSecurityGroup') as SecurityGroup;

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      FileSystemConfigs: [
        {
          Arn: stack.resolve(accessPoint.accessPointArn),
          LocalMountPath: '/mnt/efs',
        },
      ],
      Handler: 'pad-efs-storage.getDiskUsage',
      Runtime: 'nodejs14.x',
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
    }));
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      FileSystemConfigs: [
        {
          Arn: stack.resolve(accessPoint.accessPointArn),
          LocalMountPath: '/mnt/efs',
        },
      ],
      Handler: 'pad-efs-storage.padFilesystem',
      Runtime: 'nodejs14.x',
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
    }));

    cdkExpect(stack).to(haveResourceLike('AWS::StepFunctions::StateMachine', {
      // Note: No value in verifying the state machine description -- it's a massive string, so the
      // test will be fragile to changes in code generation and challenging to identify differences with.
      DefinitionString: anything(),
    }));

    cdkExpect(stack).to(haveResourceLike('Custom::AWS', {
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
    }));
  });

  test('Set desiredPadding', () => {
    // WHEN
    const desiredPaddingGB = 200;
    new PadEfsStorage(stack, 'PadEfs', {
      vpc,
      accessPoint,
      desiredPaddingGB,
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('Custom::AWS', {
      Create: {
        'Fn::Join': [
          '',
          arrayWith(`","input":"{\\"desiredPadding\\":${desiredPaddingGB}}"}}`),
        ],
      },
      Update: {
        'Fn::Join': [
          '',
          arrayWith(`","input":"{\\"desiredPadding\\":${desiredPaddingGB}}"}}`),
        ],
      },
    }));
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
      desiredPaddingGB: 20,
      securityGroup: sg,
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'pad-efs-storage.getDiskUsage',
      VpcConfig: {
        SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
      },
    }));
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'pad-efs-storage.padFilesystem',
      VpcConfig: {
        SecurityGroupIds: [ stack.resolve(sg.securityGroupId) ],
      },
    }));
  });

});
