/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MachineImage,
  Vpc,
  WindowsVersion,
} from '@aws-cdk/aws-ec2';
import {
  CfnResource,
  Construct,
  Stack,
  StackProps
} from '@aws-cdk/core';
import {
  RenderQueue,
  VersionQuery,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';

import {
  DeadlineMachineImage,
  OSType,
} from './deadline-machine-image';

export interface ComputeStackProps extends StackProps {
  /**
   * Version of Deadline to use.
   */
  readonly deadlineVersion: string;

  /**
   * The version of the Deadline components and image recipes for both Windows and Linux.
   */
  readonly imageRecipeVersion: string;

  /**
   * The render farm's RenderQueue costruct.
   */
  readonly renderQueue: RenderQueue,

  /**
   * The VPC to connect the workers to.
   */
  readonly vpc: Vpc,
}

/**
 * This stack includes the worker fleets for the render farm as well as the creation of the images that
 * those worker fleets will use.
 */
export class ComputeStack extends Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const region = Stack.of(this).region;

    const version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    // Take a Linux image and install Deadline on it to create a new image
    const linuxImage = new DeadlineMachineImage(this, 'LinuxImage', {
      deadlineVersion: version.linuxFullVersionString(),
      osType: OSType.LINUX,
      parentAmi: MachineImage.latestAmazonLinux(),
      imageVersion: props.imageRecipeVersion,
    });
    // Set up a worker fleet that uses the image we just created
    const workerFleetLinux = new WorkerInstanceFleet(this, 'WorkerFleetLinux', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      workerMachineImage: MachineImage.genericLinux({ [region]: linuxImage.amiId }),
    });
    workerFleetLinux.fleet.node.defaultChild?.node.addDependency(linuxImage.node.defaultChild as CfnResource);

    // Take a Windows image and install Deadline on it to create a new image
    const windowsImage = new DeadlineMachineImage(this, 'WindowsImage', {
      deadlineVersion: version.linuxFullVersionString(),
      osType: OSType.WINDOWS,
      parentAmi: MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_CORE_BASE),
      imageVersion: props.imageRecipeVersion,
    });
    // Set up a worker fleet that uses the image we just created
    const workerFleetWindows = new WorkerInstanceFleet(this, 'WorkerFleetWindows', {
      vpc: props.vpc,
      renderQueue: props.renderQueue,
      workerMachineImage: MachineImage.genericWindows({ [region]: windowsImage.amiId }),
    });
    workerFleetWindows.fleet.node.defaultChild?.node.addDependency(windowsImage.node.defaultChild as CfnResource);
  }
}
