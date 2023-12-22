/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import {
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  Instance,
  InstanceType,
  IVpc,
  MachineImage,
  SecurityGroup,
  Vpc,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';
import {
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';
import {
  ILogGroup,
} from 'aws-cdk-lib/aws-logs';
import {
  LogGroupFactoryProps,
} from '../../core/lib';
import {
  CWA_ASSET_LINUX,
  CWA_ASSET_WINDOWS,
} from '../../core/test/asset-constants';
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
  CONFIG_WORKER_PORT_ASSET_LINUX,
  CONFIG_WORKER_PORT_ASSET_WINDOWS,
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
      machineImage: MachineImage.latestAmazonLinux2(),
    });
  });

  test('basic setup', () => {
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              '#!/bin/bash\n' +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              'set -e\n' +
              `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
            ],
          ],
        },
      },
    });
  });

  test('custom listener port', () => {
    const otherListenerPort = 55555;

    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      workerSettings: {
        listenerPort: otherListenerPort,
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              '#!/bin/bash\n' +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              'set -e\n' +
              `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${otherListenerPort} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
            ],
          ],
        },
      },
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

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              '#!/bin/bash\n' +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              'set -e\n' +
              `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' 'g1,g2' 'p1,p2' 'r1' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
            ],
          ],
        },
      },
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
      cloudWatchLogSettings: logGroupProps,
    });
    const logGroup = config.node.findChild('ConfigLogGroup') as ILogGroup;
    const logGroupName = stack.resolve(logGroup.logGroupName);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `#!/bin/bash\nmkdir -p $(dirname '/tmp/${CWA_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CWA_ASSET_LINUX.Bucket,
              },
              `/${CWA_ASSET_LINUX.Key}.sh' '/tmp/${CWA_ASSET_LINUX.Key}.sh'\nset -e\nchmod +x '/tmp/${CWA_ASSET_LINUX.Key}.sh'\n'/tmp/${CWA_ASSET_LINUX.Key}.sh' -i `,
              {
                Ref: 'AWS::Region',
              },
              ' ',
              {
                Ref: Match.stringLikeRegexp('^ConfigStringParameter.*'),
              },
              `\nmkdir -p $(dirname '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py' '/tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py'\n` +
              `mkdir -p $(dirname '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh')\naws s3 cp 's3://`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_LINUX.Bucket,
              },
              `/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              'set -e\n' +
              `chmod +x '/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh'\n` +
              `'/tmp/${CONFIG_WORKER_ASSET_LINUX.Key}.sh' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} /tmp/${CONFIG_WORKER_PORT_ASSET_LINUX.Key}.py`,
            ],
          ],
        },
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
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
    });
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

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `<powershell>mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -file 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -ErrorAction Stop\n` +
              `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
              `&'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py\n` +
              `if (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }</powershell>`,
            ],
          ],
        },
      },
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

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `<powershell>mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -file 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -ErrorAction Stop\n` +
              `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
              `&'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' 'g1,g2' 'p1,p2' 'r1' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py\n` +
              `if (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }</powershell>`,
            ],
          ],
        },
      },
    });
  });

  test('custom listner port', () => {
    const otherListenerPort = 55555;
    // WHEN
    new WorkerInstanceConfiguration(stack, 'Config', {
      worker: instance,
      workerSettings: {
        listenerPort: otherListenerPort,
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `<powershell>mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -file 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -ErrorAction Stop\n` +
              `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
              `&'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${otherListenerPort} C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py\n` +
              `if (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }</powershell>`,
            ],
          ],
        },
      },
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
      cloudWatchLogSettings: logGroupProps,
    });
    const logGroup = config.node.findChild('ConfigLogGroup') as ILogGroup;
    const logGroupName = stack.resolve(logGroup.logGroupName);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::Instance', {
      UserData: {
        'Fn::Base64': {
          'Fn::Join': [
            '',
            [
              `<powershell>mkdir (Split-Path -Path 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CWA_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CWA_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n&'C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1' -i `,
              {
                Ref: 'AWS::Region',
              },
              ' ',
              {
                Ref: Match.stringLikeRegexp('^ConfigStringParameter.*'),
              },
              `\nif (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CWA_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }\n` +
              `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -file 'C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py' -ErrorAction Stop\n` +
              `mkdir (Split-Path -Path 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' ) -ea 0\nRead-S3Object -BucketName '`,
              {
                'Fn::Sub': CONFIG_WORKER_PORT_ASSET_WINDOWS.Bucket,
              },
              `' -key '${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -file 'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' -ErrorAction Stop\n` +
              `&'C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1' '' '' '' '${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()}' ${WorkerInstanceConfiguration['DEFAULT_LISTENER_PORT']} C:/temp/${CONFIG_WORKER_ASSET_WINDOWS.Key}.py\n` +
              `if (!$?) { Write-Error 'Failed to execute the file \"C:/temp/${CONFIG_WORKER_PORT_ASSET_WINDOWS.Key}.ps1\"' -ErrorAction Stop }</powershell>`,
            ],
          ],
        },
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
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
    });
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
    const version = new VersionQuery(stack, 'Version');
    renderQueue = new RenderQueue(stack, 'RQ', {
      version,
      vpc,
      images: { remoteConnectionServer: rcsImage },
      repository: new Repository(stack, 'Repository', {
        vpc,
        version,
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
    });
    const rqSecGrp = renderQueue.connections.securityGroups[0] as SecurityGroup;
    renderQueueSGId = stack.resolve(rqSecGrp.securityGroupId);
  });

  test('For Linux', () => {
    // GIVEN
    const instance = new Instance(stack, 'Instance', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      machineImage: MachineImage.latestAmazonLinux2(),
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
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      ToPort: 8080,
      SourceSecurityGroupId: instanceSGId,
      GroupId: renderQueueSGId,
    });
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
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      ToPort: 8080,
      SourceSecurityGroupId: instanceSGId,
      GroupId: renderQueueSGId,
    });
  });
});