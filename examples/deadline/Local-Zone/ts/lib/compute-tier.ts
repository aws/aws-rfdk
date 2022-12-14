/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  SubnetSelection,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import {
  HealthMonitor,
  IHealthMonitor,
  SessionManagerHelper,
} from 'aws-rfdk';
import {
  IHost,
  InstanceUserDataProvider,
  IRenderQueue,
  IWorkerFleet,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';
import { Construct } from 'constructs';

/**
 * Properties for {@link ComputeTier}.
 */
export interface ComputeTierProps extends cdk.StackProps {
  /**
   * The VPC to deploy resources into.
   */
  readonly vpc: IVpc;

  /**
   * The availability zones the worker instances will be deployed to. This can include your local
   * zones, but they must belong to the same region as the standard zones used in other stacks in
   * this application.
   */
  readonly availabilityZones: string[],

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
}

class UserDataProvider extends InstanceUserDataProvider {
  preWorkerConfiguration(host: IHost): void {
    // Add code here for mounting your NFS to the workers
    host.userData.addCommands('echo preWorkerConfiguration');
  }
}

/**
 * The computer tier consists of the worker fleets. We'll be deploying the workers into the
 * local zone we're using.
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
   */
  constructor(scope: Construct, id: string, props: ComputeTierProps) {
    super(scope, id, props);

    // We can put the health monitor and worker fleet in all of the local zones we're using
    const subnets: SubnetSelection = {
      availabilityZones: props.availabilityZones,
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      onePerAz: true,
    };

    this.healthMonitor = new HealthMonitor(this, 'HealthMonitor', {
      vpc: props.vpc,
      vpcSubnets: subnets,
      deletionProtection: false,
    });

    this.workerFleet = new WorkerInstanceFleet(this, 'WorkerFleet', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      workerMachineImage: props.workerMachineImage,
      healthMonitor: this.healthMonitor,
      keyName: props.keyPairName,
      // Not all instance types will be available in local zones. For a list of the instance types
      // available in each local zone, you can refer to:
      // https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/#AWS_Services
      // BURSTABLE3 is a T3; the third generation of burstable instances
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.LARGE),
      userDataProvider: new UserDataProvider(this, 'UserDataProvider'),
      vpcSubnets: subnets,
    });

    SessionManagerHelper.grantPermissionsTo(this.workerFleet);
  }
}

