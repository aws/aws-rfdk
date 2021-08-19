import * as path from 'path';

import {
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  MachineImage,
  OperatingSystemType,
  Port,
  SubnetType,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import { Bucket } from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';

import {
  IRenderQueue,
} from 'aws-rfdk/deadline';
import {
  ScriptAsset,
  SessionManagerHelper,
} from 'aws-rfdk';

export interface WorkstationTierProps extends cdk.StackProps {
  /**
   * The VPC to deploy service tier resources into.
   */
  readonly vpc: IVpc;

  /**
   * The render queue.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * The name of the EC2 keypair to associate with Worker nodes.
   */
  readonly keyPairName?: string;

  readonly deadlineInstallerBucketName: string;
  readonly deadlineInstallerObjectNameLinux: string;
  readonly deadlineInstallerObjectNameWindows: string;
}

/**
 * The workstation tier contains a workstation host that can be used
 */
export class WorkstationTier extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: WorkstationTierProps) {
    super(scope, id, props);

    const installersBucket = Bucket.fromBucketName(this, 'InstallersBucket', props.deadlineInstallerBucketName);

    // Setup a Windows instance with Deadline installed and configured to connect to the render queue, with
    // Session Manager and RDP access
    const windowsFarmMonitor = new Instance(this, 'WindowsBastionInstance', {
      instanceName: 'WindowsBastionInstance',
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
      keyName: props.keyPairName,
    });
    SessionManagerHelper.grantPermissionsTo(windowsFarmMonitor);
    windowsFarmMonitor.connections.allowFromAnyIpv4(Port.tcp(3389));

    installersBucket.grantRead(windowsFarmMonitor);
    const windowsInstallerScriptAsset = ScriptAsset.fromPathConvention(this, 'WindowsInstallerScript', {
      osType: OperatingSystemType.WINDOWS,
      baseName: 'installDeadlineClient',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts',
      ),
    });
    windowsInstallerScriptAsset.executeOn({
      host: windowsFarmMonitor,
      args: [
        cdk.Stack.of(installersBucket).region,
        installersBucket.bucketName,
        props.deadlineInstallerObjectNameWindows,
      ],
    });

    props.renderQueue.configureClientInstance({
      host: windowsFarmMonitor,
      restartLauncher: true,
    });

    // Setup a Windows instance with Deadline installed and configured to connect to the render queue, with
    // Session Manager and RDP access
    const windowsControlInstance = new Instance(this, 'WindowsControlInstance', {
      instanceName: 'WindowsControlInstance',
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
      keyName: props.keyPairName,
    });
    SessionManagerHelper.grantPermissionsTo(windowsControlInstance);
    windowsControlInstance.connections.allowFromAnyIpv4(Port.tcp(3389));

    installersBucket.grantRead(windowsControlInstance);
    windowsInstallerScriptAsset.executeOn({
      host: windowsControlInstance,
      args: [
        cdk.Stack.of(installersBucket).region,
        installersBucket.bucketName,
        props.deadlineInstallerObjectNameWindows,
      ],
    });

    props.renderQueue.configureClientInstance({
      host: windowsControlInstance,
      restartLauncher: true,
    });

    // Setup a Linux instance with Deadline installed and configured to connect to the render queue, with
    // Session Manager and SSH access
    const linuxFarmMonitor = new Instance(this, 'LinuxBastionInstance', {
      instanceName: 'LinuxBastionInstance',
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestAmazonLinux(),
      keyName: props.keyPairName,
    });
    SessionManagerHelper.grantPermissionsTo(linuxFarmMonitor);
    linuxFarmMonitor.connections.allowFromAnyIpv4(Port.tcp(22));

    installersBucket.grantRead(linuxFarmMonitor);
    const linuxInstallerScriptAsset = ScriptAsset.fromPathConvention(this, 'LinuxInstallerScript', {
      osType: OperatingSystemType.LINUX,
      baseName: 'installDeadlineClient',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts',
      ),
    });
    linuxInstallerScriptAsset.executeOn({
      host: linuxFarmMonitor,
      args: [
        cdk.Stack.of(installersBucket).region,
        installersBucket.bucketName,
        props.deadlineInstallerObjectNameLinux,
      ],
    });

    props.renderQueue.configureClientInstance({
      host: linuxFarmMonitor,
      restartLauncher: true,
    });

    const linuxControlInstance = new Instance(this, 'LinuxControlInstance', {
      instanceName: 'LinuxControlInstance',
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestAmazonLinux(),
      keyName: props.keyPairName,
    });
    SessionManagerHelper.grantPermissionsTo(linuxControlInstance);
    linuxControlInstance.connections.allowFromAnyIpv4(Port.tcp(22));

    installersBucket.grantRead(linuxControlInstance);
    linuxInstallerScriptAsset.executeOn({
      host: linuxControlInstance,
      args: [
        cdk.Stack.of(installersBucket).region,
        installersBucket.bucketName,
        props.deadlineInstallerObjectNameLinux,
      ],
    });

    props.renderQueue.configureClientInstance({
      host: linuxControlInstance,
      restartLauncher: true,
    });
  }
}
