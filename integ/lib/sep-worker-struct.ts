/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstanceType,
  MachineImage,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Stack,
} from '@aws-cdk/core';
import {
  ConfigureSpotEventPlugin,
  SpotEventPluginFleet,
} from 'aws-rfdk/deadline';
import { NetworkTier } from '../components/_infrastructure/lib/network-tier';
import { RenderStruct } from './render-struct';

/**
 * Properties for SepWorkerStruct.
 */
export interface SepWorkerStructProps {
  readonly integStackTag: string;
  readonly renderStruct: RenderStruct;
}

/**
 * A construct that sets up a Spot Event Plugin fleet configurator in the RFDK integ infrastructure VPC.
 */
export class SepWorkerStruct extends Construct {
  public readonly fleets: SpotEventPluginFleet[];
  public readonly configurator: ConfigureSpotEventPlugin;

  constructor(scope: Construct, id: string, props: SepWorkerStructProps) {
    super(scope, id);

    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const linuxAmi = process.env.LINUX_DEADLINE_AMI_ID!.toString();

    // Retrieve VPC created for _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    this.fleets = [
      new SpotEventPluginFleet(this, 'SepFleet', {
        vpc,
        vpcSubnets: vpc.selectSubnets({ subnetGroupName: NetworkTier.subnetConfig.sepFleet.name }),
        renderQueue: props.renderStruct.renderQueue,
        maxCapacity: 1,
        workerMachineImage: MachineImage.genericLinux({ [Stack.of(this).region]: linuxAmi }),
        deadlineGroups: ['sep_group'],
        instanceTypes: [new InstanceType('t2.micro')],
      }),
    ];

    this.configurator = new ConfigureSpotEventPlugin(this, 'SepConfigurator', {
      vpc,
      renderQueue: props.renderStruct.renderQueue,
      spotFleets: this.fleets,
    });
  }
}
