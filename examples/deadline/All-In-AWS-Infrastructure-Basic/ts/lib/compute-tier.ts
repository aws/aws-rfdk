/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IMachineImage,
  IVpc,
} from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import {
  ConfigureSpotEventPlugin,
  IRenderQueue,
  IWorkerFleet,
  SpotEventPluginFleet,
  UsageBasedLicense,
  UsageBasedLicensing,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';
import {
  HealthMonitor,
  IHealthMonitor,
  SessionManagerHelper,
} from 'aws-rfdk';

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
   * Licensing source for UBL for worker nodes.
   */
  readonly usageBasedLicensing?: UsageBasedLicensing;

  /**
   * List of the usage-based liceses that the worker nodes will be served.
   */
  readonly licenses?: UsageBasedLicense[];
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
  constructor(scope: cdk.Construct, id: string, props: ComputeTierProps) {
    super(scope, id, props);

    this.healthMonitor = new HealthMonitor(this, 'HealthMonitor', {
      vpc: props.vpc,
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
      vpcSubnets: {
        subnetGroupName: "WorkerFleet",
      },
    });

    this.workerFleet = new WorkerInstanceFleet(this, 'WorkerFleet', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      workerMachineImage: props.workerMachineImage,
      healthMonitor: this.healthMonitor,
      keyName: props.keyPairName,
      vpcSubnets: {
        subnetGroupName: "WorkerFleet",
      },
    });

    // This is an optional feature that will set up your EC2 instances to be enabled for use with
    // the Session Manager. These worker fleet instances aren't available through a public subnet,
    // so connecting to them directly through SSH isn't easy.
    SessionManagerHelper.grantPermissionsTo(this.workerFleet);

    if (props.usageBasedLicensing && props.licenses) {
      props.usageBasedLicensing.grantPortAccess(this.workerFleet, props.licenses);
    }
    const fleet1 = new SpotEventPluginFleet(this, 'SpotEventPluginFleet1', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      deadlineGroups: [
        'group_name1',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: props.workerMachineImage,
      maxCapacity: 5,
      vpcSubnets: {
        subnetGroupName: 'SpotFleet1',
      },
    });

    const fleet2 = new SpotEventPluginFleet(this, 'SpotEventPluginFleet2', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      deadlineGroups: [
        'group_name2',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: props.workerMachineImage,
      maxCapacity: 5,
      vpcSubnets: {
        subnetGroupName: 'SpotFleet2',
      },
    });

    new ConfigureSpotEventPlugin(this, 'ConfigureSpotEventPlugin', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      spotFleets: [
        fleet1,
        fleet2,
      ],
      configuration: {
        enableResourceTracker: true,
      },
    });
  }
}

