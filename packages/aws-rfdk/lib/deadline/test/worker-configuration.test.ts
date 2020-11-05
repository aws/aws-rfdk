/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResource,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceType,
  IVpc,
  MachineImage,
  SecurityGroup,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  ILogGroup,
} from '@aws-cdk/aws-logs';
import {
  StringParameter,
} from '@aws-cdk/aws-ssm';
import {
  Stack,
} from '@aws-cdk/core';
import {
  LogGroupFactoryProps,
} from '../../core/lib';
import {
  RenderQueue,
  Repository,
  Version,
  VersionQuery,
  WorkerInstanceConfiguration,
} from '../lib';
import {
  CONFIG_WORKER_ASSET_LINUX,
  CONFIG_WORKER_ASSET_WINDOWS,
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
  linuxDownloadRunScriptBoilerplate,
  windowsDownloadRunScriptBoilerplate,
} from './asset-constants';

describe('Test WorkerInstanceConfiguration for Linux', () => {
  let stack: Stack;
  let vpc: IVpc;
  let instance: Instance;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
  });

  test('basic setup', () => {
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
    });
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '#!/bin/bash\nmkdir -p $(dirname \'/tmp/',
          ...linuxDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_LINUX),
          `\' \'\' \'\' \'\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'`,
        ],
      ],
    });
  });

  test('groups, pools, region setup', () => {
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      workerSettings: {
        groups: ['g1', 'g2'],
        pools: ['p1', 'p2'],
        region: 'r1',
      },
    });
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '#!/bin/bash\nmkdir -p $(dirname \'/tmp/',
          ...linuxDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_LINUX),
          `\' \'g1,g2\' \'p1,p2\' \'r1\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'`,
        ],
      ],
    });
  });

  test('log setup', () => {
    // GIVEN
    const logGroupProps: LogGroupFactoryProps = {
      logGroupPrefix: '/test-prefix/',
    };

    // WHEN
    const config = new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      cloudwatchLogSettings: logGroupProps,
    });
    const ssmParam = config.node.findChild('StringParameter');
    const logGroup = config.node.findChild('ConfigLogGroupWrapper');
    const ssmParamName = stack.resolve((ssmParam as StringParameter).parameterName);
    const logGroupName = stack.resolve((logGroup as ILogGroup).logGroupName);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '#!/bin/bash\nmkdir -p $(dirname \'/tmp/',
          ...linuxDownloadRunScriptBoilerplate(CWA_ASSET_LINUX),
          '\' ',
          ssmParamName,
          '\nmkdir -p $(dirname \'/tmp/',
          ...linuxDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_LINUX),
          `\' \'\' \'\' \'\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'`,
        ],
      ],
    });

    expectCDK(stack).to(haveResource('AWS::SSM::Parameter', {
      Value: {
        'Fn::Join': [
          '',
          [
            '{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"cloud-init-output-{instance_id}\",\"file_path\":\"/var/log/cloud-init-output.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"WorkerLogs-{instance_id}\",\"file_path\":\"/var/log/Thinkbox/Deadline10/deadlineslave*.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"LauncherLogs-{instance_id}\",\"file_path\":\"/var/log/Thinkbox/Deadline10/deadlinelauncher*.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
          ],
        ],
      },
    }));
  });
});

describe('Test WorkerInstanceConfiguration for Windows', () => {
  let stack: Stack;
  let vpc: IVpc;
  let instance: Instance;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });
  });

  test('basic setup', () => {
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
    });
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '<powershell>mkdir (Split-Path -Path \'C:/temp/',
          ...windowsDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_WINDOWS),
          `\' \'\' \'\' \'\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'` +
          '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  {
                    Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
                  },
                ],
              },
            ],
          },
          {
            'Fn::Select': [
              1,
              {
                'Fn::Split': [
                  '||',
                  {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
                ],
              },
            ],
          },
          '\"\' -ErrorAction Stop }</powershell>',
        ],
      ],
    });
  });

  test('groups, pools, region setup', () => {
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      workerSettings: {
        groups: ['g1', 'g2'],
        pools: ['p1', 'p2'],
        region: 'r1',
      },
    });
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '<powershell>mkdir (Split-Path -Path \'C:/temp/',
          ...windowsDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_WINDOWS),
          `\' \'g1,g2\' \'p1,p2\' \'r1\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'` +
          '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  {
                    Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
                  },
                ],
              },
            ],
          },
          {
            'Fn::Select': [
              1,
              {
                'Fn::Split': [
                  '||',
                  {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
                ],
              },
            ],
          },
          '\"\' -ErrorAction Stop }</powershell>',
        ],
      ],
    });
  });

  test('log setup', () => {
    // GIVEN
    const logGroupProps: LogGroupFactoryProps = {
      logGroupPrefix: '/test-prefix/',
    };

    // WHEN
    const config = new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      cloudwatchLogSettings: logGroupProps,
    });
    const ssmParam = config.node.findChild('StringParameter');
    const logGroup = config.node.findChild('ConfigLogGroupWrapper');
    const ssmParamName = stack.resolve((ssmParam as StringParameter).parameterName);
    const logGroupName = stack.resolve((logGroup as ILogGroup).logGroupName);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          '<powershell>mkdir (Split-Path -Path \'C:/temp/',
          ...windowsDownloadRunScriptBoilerplate(CWA_ASSET_WINDOWS),
          '\' ',
          ssmParamName,
          '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  {
                    Ref: CWA_ASSET_WINDOWS.Key,
                  },
                ],
              },
            ],
          },
          {
            'Fn::Select': [
              1,
              {
                'Fn::Split': [
                  '||',
                  {Ref: CWA_ASSET_WINDOWS.Key},
                ],
              },
            ],
          },
          '\"\' -ErrorAction Stop }' +
          '\nmkdir (Split-Path -Path \'C:/temp/',
          ...windowsDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_WINDOWS),
          `\' \'\' \'\' \'\' \'${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}\'` +
          '\nif (!$?) { Write-Error \'Failed to execute the file \"C:/temp/',
          {
            'Fn::Select': [
              0,
              {
                'Fn::Split': [
                  '||',
                  {
                    Ref: CONFIG_WORKER_ASSET_WINDOWS.Key,
                  },
                ],
              },
            ],
          },
          {
            'Fn::Select': [
              1,
              {
                'Fn::Split': [
                  '||',
                  {Ref: CONFIG_WORKER_ASSET_WINDOWS.Key},
                ],
              },
            ],
          },
          '\"\' -ErrorAction Stop }</powershell>',
        ],
      ],
    });

    expectCDK(stack).to(haveResource('AWS::SSM::Parameter', {
      Value: {
        'Fn::Join': [
          '',
          [
            '{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"UserdataExecution-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Amazon\\\\EC2-Windows\\\\Launch\\\\Log\\\\UserdataExecution.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"WorkerLogs-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Thinkbox\\\\Deadline10\\\\logs\\\\deadlineslave*.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            logGroupName,
            '\",\"log_stream_name\":\"LauncherLogs-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Thinkbox\\\\Deadline10\\\\logs\\\\deadlinelauncher*.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
          ],
        ],
      },
    }));
  });
});

describe('Test WorkerInstanceConfiguration connect to RenderQueue', () => {
  let stack: Stack;
  let vpc: IVpc;
  let renderQueue: RenderQueue;
  let renderQueueSGId: any;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
    const rcsImage = ContainerImage.fromAsset(__dirname);
    const version = VersionQuery.exact(stack, 'Version', {
      majorVersion: 10,
      minorVersion: 0,
      releaseVersion: 0,
      patchVersion: 0,
    });
    renderQueue = new RenderQueue(stack, 'RQ', {
      version,
      vpc,
      images: { remoteConnectionServer: rcsImage },
      repository: new Repository(stack, 'Repository', {
        vpc,
        version,
      }),
    });
    const rqSecGrp = renderQueue.connections.securityGroups[0] as SecurityGroup;
    renderQueueSGId = stack.resolve(rqSecGrp.securityGroupId);
  });

  test('For Linux', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });

    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      renderQueue,
    });
    const instanceSG = instance.connections.securityGroups[0] as SecurityGroup;
    const instanceSGId = stack.resolve(instanceSG.securityGroupId);

    // THEN
    // Open-box testing. We know that we invoked the connection method on the
    // render queue if the security group for the instance has an ingress rule to the RQ.
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      ToPort: 8080,
      SourceSecurityGroupId: instanceSGId,
      GroupId: renderQueueSGId,
    }));
  });

  test('For Windows', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });

    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      renderQueue,
    });
    const instanceSG = instance.connections.securityGroups[0] as SecurityGroup;
    const instanceSGId = stack.resolve(instanceSG.securityGroupId);

    // THEN
    // Open-box testing. We know that we invoked the connection method on the
    // render queue if the security group for the instance has an ingress rule to the RQ.
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      ToPort: 8080,
      SourceSecurityGroupId: instanceSGId,
      GroupId: renderQueueSGId,
    }));
  });
});