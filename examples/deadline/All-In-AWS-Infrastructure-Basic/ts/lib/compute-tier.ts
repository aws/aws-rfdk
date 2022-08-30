/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  IMachineImage,
  IVpc,
  Port,
} from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import {
  IHost,
  InstanceUserDataProvider,
  IRenderQueue,
  IWorkerFleet,
  UsageBasedLicense,
  UsageBasedLicensing,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';
import {
  HealthMonitor,
  IHealthMonitor,
  SessionManagerHelper,
} from 'aws-rfdk';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as path from 'path'

import { Subnets } from './subnets';

/**
 * Properties for {@link ComputeTier}.
 */
export interface ComputeTierProps extends cdk.StackProps {
  /**
   * The VPC to deploy resources into.
   */
  readonly vpc: IVpc;

  /**
   * The {@link IRenderQueue} that Deadline Workers connect to.
   */
  readonly renderQueue: IRenderQueue;

  /**
   * The {@link IMachineImage} to use for Workers (needs Deadline Client installed).
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * The name of the EC2 keypair to associate with Worker nodes.
   */
  readonly keyPairName?: string;

  /**
   * The bastion host to allow connection to Worker nodes.
   */
  readonly bastion?: BastionHostLinux;

  /**
   * Licensing source for UBL for worker nodes.
   */
  readonly usageBasedLicensing?: UsageBasedLicensing;

  /**
   * List of the usage-based liceses that the worker nodes will be served.
   */
  readonly licenses?: UsageBasedLicense[];
}

class UserDataProvider extends InstanceUserDataProvider {
  preCloudWatchAgent(host: IHost): void {
    host.userData.addCommands('echo preCloudWatchAgent');
  }
  preRenderQueueConfiguration(host: IHost): void {
    host.userData.addCommands('echo preRenderQueueConfiguration');
  }
  preWorkerConfiguration(host: IHost): void {
    host.userData.addCommands('echo preWorkerConfiguration');
  }
  postWorkerLaunch(host: IHost): void {
    host.userData.addCommands('echo postWorkerLaunch');
    if (host.node.scope != undefined) {
      const testScript = new Asset(
        host.node.scope as Construct,
        'SampleAsset',
        {path: path.join(__dirname, '..', '..', 'scripts', 'configure_worker.sh')},
      );
      testScript.grantRead(host);
      const localPath = host.userData.addS3DownloadCommand({
        bucket: testScript.bucket,
        bucketKey: testScript.s3ObjectKey,
      });
      host.userData.addExecuteFileCommand({
        filePath: localPath,
      })
    }
  }
}

/**
 * The computer tier consists of raw compute power. For a Deadline render farm,
 * this will be the fleet of Worker nodes that render Deadline jobs.
 */
export class ComputeTier extends cdk.Stack {
  /**
   * The {@link IWorkerFleet}.
   */
  public readonly workerFleet: IWorkerFleet;

  /**
   * The {@link IHealthMonitor} used to maintain the worker fleet.
   */
  public readonly healthMonitor: IHealthMonitor;

  /**
   * Initializes a new instance of {@link ComputeTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties of this construct.
   */
  constructor(scope: Construct, id: string, props: ComputeTierProps) {
    super(scope, id, props);

    this.healthMonitor = new HealthMonitor(this, 'HealthMonitor', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: Subnets.INFRASTRUCTURE.name,
      },
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
    });

    this.workerFleet = new WorkerInstanceFleet(this, 'WorkerFleet', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: Subnets.WORKERS.name,
      },
      renderQueue: props.renderQueue,
      workerMachineImage: props.workerMachineImage,
      healthMonitor: this.healthMonitor,
      keyName: props.keyPairName,
      userDataProvider: new UserDataProvider(this, 'UserDataProvider'),
    });

    // This is an optional feature that will set up your EC2 instances to be enabled for use with
    // the Session Manager. These worker fleet instances aren't available through a public subnet,
    // so connecting to them directly through SSH isn't easy.
    SessionManagerHelper.grantPermissionsTo(this.workerFleet);

    if (props.usageBasedLicensing && props.licenses) {
      props.usageBasedLicensing.grantPortAccess(this.workerFleet, props.licenses);
    }

    if (props.bastion) {
      this.workerFleet.connections.allowFrom(props.bastion, Port.tcp(22));
    }
  }
}

