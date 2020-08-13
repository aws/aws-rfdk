/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MachineImage, Port, Vpc } from '@aws-cdk/aws-ec2';
import { Construct, Stack } from '@aws-cdk/core';
import { X509CertificatePem } from 'aws-rfdk';
import { IWorkerFleet, RenderQueue, WorkerInstanceFleet } from 'aws-rfdk/deadline';
import { RenderStruct } from './render-struct';

export interface WorkerStructProps {
  readonly integStackTag: string;
  readonly renderStruct: RenderStruct;
}

export class WorkerStruct extends Construct {

  readonly workerFleet: Array<IWorkerFleet> = [];
  readonly renderQueue: RenderQueue;
  readonly cert?: X509CertificatePem;

  constructor(scope: Construct, id: string, props: WorkerStructProps) {
    super(scope, id);

    // Collect environment variables
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const deadlineAmiId = process.env.DEADLINE_AMI_ID!.toString();

    // Retrieve VPC created for _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    const deadlineClientLinuxAmiMap: Record<string, string> = {[Stack.of(this).region]: deadlineAmiId};

    this.renderQueue = props.renderStruct.renderQueue;
    this.cert = props.renderStruct.cert;

    this.workerFleet.push(
      new WorkerInstanceFleet(this, 'Worker1', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage: MachineImage.genericLinux(deadlineClientLinuxAmiMap),
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        groups: ['testgroup'],
      }),
      new WorkerInstanceFleet(this, 'Worker2', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage: MachineImage.genericLinux(deadlineClientLinuxAmiMap),
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        pools: ['testpool'],
      }),
      new WorkerInstanceFleet(this, 'Worker3', {
        vpc,
        renderQueue: this.renderQueue,
        workerMachineImage: MachineImage.genericLinux(deadlineClientLinuxAmiMap),
        logGroupProps: {
          logGroupPrefix: Stack.of(this).stackName + '-' + id,
        },
        region: 'testregion',
      }),
    );

    const taskDefinition = this.renderQueue.node.findChild('RCSTask');
    const listener = this.renderQueue.loadBalancer.node.findChild('PublicListener');

    this.workerFleet.forEach( worker => {
      worker.connections.allowFromAnyIpv4(Port.tcp(22));
      worker.node.addDependency(taskDefinition);
      worker.node.addDependency(listener);
    });

  }
}
