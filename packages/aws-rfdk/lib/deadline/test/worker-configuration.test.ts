/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as expectCDK,
  haveResource,
  // haveResourceLike,
} from '@aws-cdk/assert';
import {
  AmazonLinuxGeneration,
  Instance,
  InstanceType,
  IVpc,
  MachineImage,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  Stack,
} from '@aws-cdk/core';
import {
  LogGroupFactoryProps,
} from '../../core/lib';
import {
  WorkerConfiguration, WorkerSettings,
} from '../lib';
import {
  CONFIG_WORKER_ASSET_LINUX,
  CONFIG_WORKER_ASSET_WINDOWS,
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from './asset-constants';

function linuxDownloadRunScriptBoilerplate(script: { Bucket: string, Key: string }) {
  return [
    '#!/bin/bash\nmkdir -p $(dirname \'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\')\naws s3 cp \'s3://',
    {Ref: script.Bucket},
    '/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' \'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\'\n' +
    'set -e\n' +
    'chmod +x \'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: script.Key,
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\'\n\'/tmp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
  ];
}

function windowsDownloadRunScriptBoilerplate(script: { Bucket: string, Key: string }) {
  return [
    '<powershell>mkdir (Split-Path -Path \'C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' ) -ea 0\nRead-S3Object -BucketName \'',
    {Ref: script.Bucket},
    '\' -key \'',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' -file \'C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {Ref: script.Key},
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
            {Ref: script.Key},
          ],
        },
      ],
    },
    '\' -ErrorAction Stop\n&\'C:/temp/',
    {
      'Fn::Select': [
        0,
        {
          'Fn::Split': [
            '||',
            {
              Ref: script.Key,
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
            {Ref: script.Key},
          ],
        },
      ],
    },
  ];
}

describe('Test WorkerConfiguration', () => {
  let stack: Stack;
  let vpc: IVpc;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'Vpc');
  });

  test('configure log stream for Linux', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    const logGroupProps: LogGroupFactoryProps = {
      logGroupPrefix: '/test-prefix/',
    };
    const config = new WorkerConfiguration(stack, 'Config');

    // WHEN
    config.configureCloudWatchLogStream(instance, 'Worker', logGroupProps);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          ...linuxDownloadRunScriptBoilerplate(CWA_ASSET_LINUX),
          '\' ',
          {Ref: 'ConfigStringParameterC2BE550F'},
        ],
      ],
    });
    expectCDK(stack).to(haveResource('AWS::SSM::Parameter', {
      Value: {
        'Fn::Join': [
          '',
          [
            '{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"log_group_name\":\"',
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"cloud-init-output-{instance_id}\",\"file_path\":\"/var/log/cloud-init-output.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"WorkerLogs-{instance_id}\",\"file_path\":\"/var/log/Thinkbox/Deadline10/deadlineslave*.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"LauncherLogs-{instance_id}\",\"file_path\":\"/var/log/Thinkbox/Deadline10/deadlinelauncher*.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
          ],
        ],
      },
    }));
  });

  test('configure log stream for Windows', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });
    const logGroupProps: LogGroupFactoryProps = {
      logGroupPrefix: '/test-prefix/',
    };
    const config = new WorkerConfiguration(stack, 'Config');

    // WHEN
    config.configureCloudWatchLogStream(instance, 'Worker', logGroupProps);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          ...windowsDownloadRunScriptBoilerplate(CWA_ASSET_WINDOWS),
          '\' ',
          {Ref: 'ConfigStringParameterC2BE550F'},
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
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"UserdataExecution-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Amazon\\\\EC2-Windows\\\\Launch\\\\Log\\\\UserdataExecution.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"WorkerLogs-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Thinkbox\\\\Deadline10\\\\logs\\\\deadlineslave*.log\",\"timezone\":\"Local\"},{\"log_group_name\":\"',
            {
              'Fn::GetAtt': [
                'ConfigWorkerLogGroupWrapperDC3AF2E7',
                'LogGroupName',
              ],
            },
            '\",\"log_stream_name\":\"LauncherLogs-{instance_id}\",\"file_path\":\"C:\\\\ProgramData\\\\Thinkbox\\\\Deadline10\\\\logs\\\\deadlinelauncher*.log\",\"timezone\":\"Local\"}]}},\"log_stream_name\":\"DefaultLogStream-{instance_id}\",\"force_flush_interval\":15}}',
          ],
        ],
      },
    }));
  });

  test('setup Worker for Linux', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
    });
    const workerSettings: WorkerSettings = {
      groups: ['g1', 'g2'],
      pools: ['p1', 'p2'],
      region: 'r1',
    };
    const config = new WorkerConfiguration(stack, 'Config');

    // WHEN
    config.configureWorkerSettings(instance, 'Worker', workerSettings);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          ...linuxDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_LINUX),
          '\' \'g1,g2\' \'p1,p2\' \'r1\' \'10.1.9.2\'',
        ],
      ],
    });
  });

  test('setup Worker for Windows', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
    });
    const workerSettings: WorkerSettings = {
      groups: ['g1', 'g2'],
      pools: ['p1', 'p2'],
      region: 'r1',
    };
    const config = new WorkerConfiguration(stack, 'Config');

    // WHEN
    config.configureWorkerSettings(instance, 'Worker', workerSettings);
    const userData = stack.resolve(instance.userData.render());

    // THEN
    expect(userData).toStrictEqual({
      'Fn::Join': [
        '',
        [
          ...windowsDownloadRunScriptBoilerplate(CONFIG_WORKER_ASSET_WINDOWS),
          '\' \'g1,g2\' \'p1,p2\' \'r1\' \'10.1.9.2\'' +
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
});