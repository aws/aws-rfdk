/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IMachineImage, MachineImage, Port, Vpc } from '@aws-cdk/aws-ec2';
import { Construct, Stack } from '@aws-cdk/core';
import { X509CertificatePem } from 'aws-rfdk';
import { IWorkerFleet, RenderQueue, WorkerInstanceFleet } from 'aws-rfdk/deadline';
import { RenderStruct } from './render-struct';

export interface WorkerStructProps {
  readonly integStackTag:string;
  readonly renderStruct:RenderStruct;
  readonly os:string;
}

export class WorkerStruct extends Construct {

  readonly workerFleet:Array<IWorkerFleet> = [];
  readonly renderQueue:RenderQueue;
  readonly cert?:X509CertificatePem;

  constructor(scope:Construct, id:string, props:WorkerStructProps) {
    super(scope, id);

    // Collect environment variables
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const linuxAmi = process.env.LINUX_DEADLINE_AMI_ID!.toString();
    const windowsAmi = process.env.WINDOWS_DEADLINE_AMI_ID!.toString();

    let workerMachineImage: IMachineImage;

    // Retrieve VPC created for _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    this.renderQueue = props.renderStruct.renderQueue;
    this.cert = props.renderStruct.cert;

    if( props.os === 'Windows' ) {
      const deadlineClientWindowsAmiMap: Record<string, string> = {[Stack.of(this).region]: windowsAmi};
      workerMachineImage = MachineImage.genericWindows(deadlineClientWindowsAmiMap);
    }
    else {
      const deadlineClientLinuxAmiMap: Record<string, string> = {[Stack.of(this).region]: linuxAmi};
      workerMachineImage = MachineImage.genericLinux(deadlineClientLinuxAmiMap);
    }

    this.workerFleet.push(
      new WorkerInstanceFleet(this, 'Worker1', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage,
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        groups: ['testgroup'],
      }),
      new WorkerInstanceFleet(this, 'Worker2', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage,
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        pools: ['testpool'],
      }),
      new WorkerInstanceFleet(this, 'Worker3', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage,
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        region: 'testregion',
      }),
    );

    this.workerFleet.forEach( worker => {
      worker.connections.allowFromAnyIpv4(Port.tcp(22));
    });

  }
}
