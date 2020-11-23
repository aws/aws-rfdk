/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  IMachineImage,
  IVpc,
  Port,
} from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import {
  IRenderQueue,
  IWorkerFleet,
  UsageBasedLicense,
  UsageBasedLicensing,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';
import {
  HealthMonitor,
  IHealthMonitor,
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
    });

    this.workerFleet = new WorkerInstanceFleet(this, 'WorkerFleet', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      workerMachineImage: props.workerMachineImage,
      healthMonitor: this.healthMonitor,
      keyName: props.keyPairName,
    });

    if (props.usageBasedLicensing && props.licenses) {
      props.usageBasedLicensing.grantPortAccess(this.workerFleet, props.licenses);
    }

    if (props.bastion) {
      this.workerFleet.connections.allowFrom(props.bastion, Port.tcp(22));
    }
  }
}

