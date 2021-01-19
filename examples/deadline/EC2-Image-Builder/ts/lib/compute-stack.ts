/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MachineImage,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  CfnResource,
  Construct,
  Stack,
  StackProps
} from '@aws-cdk/core';
import {
  RenderQueue,
  WorkerInstanceFleet,
} from 'aws-rfdk/deadline';

import {
  DeadlineImage,
  OSType,
} from './deadline-image';

export interface ComputeStackProps extends StackProps {
  /**
   * The AMI ID that Image Builder will use as the parent to create the new Linux AMI from
   */
  readonly deadlineLinuxParentAmiId: string;

  /**
   * The AMI ID that Image Builder will use as the parent to create the new Windows AMI from
   */
  readonly deadlineWindowsParentAmiId: string;

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

    // Take a Linux image and install Deadline on it to create a new image
    const linuxImage = new DeadlineImage(this, 'LinuxImage', {
      deadlineVersion: props.deadlineVersion,
      osType: OSType.LINUX,
      parentAmi: props.deadlineLinuxParentAmiId,
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
    const windowsImage = new DeadlineImage(this, 'WindowsImage', {
      deadlineVersion: props.deadlineVersion,
      osType: OSType.WINDOWS,
      parentAmi: props.deadlineWindowsParentAmiId,
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
