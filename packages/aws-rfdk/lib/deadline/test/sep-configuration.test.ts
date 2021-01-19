/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as cdkExpect,
  haveResource,
  haveResourceLike,
  // ResourcePart,
} from '@aws-cdk/assert';
import {
  GenericWindowsImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  App,
  Stack,
} from '@aws-cdk/core';
import {
  IRenderQueue,
  RenderQueue,
  SEPConfigurationSetup,
  Repository,
  VersionQuery,
} from '../lib';
import {
  SEPSpotFleet,
} from '../lib/sep-spotfleet';

describe('SEPConfigurationSetup', () => {
  let stack: Stack;
  let vpc: Vpc;
  let renderQueue: IRenderQueue;
  let app: App;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'stack', {
      env: {
        region: 'us-east-1',
      },
    });
    vpc = new Vpc(stack, 'Vpc');

    const version = new VersionQuery(stack, 'VersionQuery');
    renderQueue = new RenderQueue(stack, 'RQ', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(stack, 'Repository', {
        vpc,
        version,
      }),
      version,
    });
  });

  test('created correctly', () => {
    // GIVEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet1', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name1',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });

    // WHEN
    new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
      vpc,
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet, // TODO: Typescript is complaining
        ],
        groupPools: {
          group_name1: ['pool1', 'pool2'],
        },
      },
    });

    // THEN
    cdkExpect(stack).to(haveResource('Custom::RFDK_SEPConfigurationSetup', {
    }));
  });

  test('use selected subnets', () => {
    // GIVEN
    const fleet = new SEPSpotFleet(stack, 'spotFleet1', {
      vpc,
      renderQueue: renderQueue,
      deadlineGroups: [
        'group_name1',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
      ],
      workerMachineImage: new GenericWindowsImage({
        'us-east-1': 'ami-any',
      }),
      targetCapacity: 1,
    });

    // TODO: maybe create them in describe
    const groupPools: Map<string, string[]> = new Map<string, string[]>();
    groupPools.set('group_name1', ['pool1', 'pool2']);

    // WHEN
    new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
      vpc,
      vpcSubnets: { subnets: [ vpc.privateSubnets[0] ] },
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet,
        ],
        groupPools: groupPools,
      },
    });

    // THEN
    cdkExpect(stack).to(haveResourceLike('AWS::Lambda::Function', {
      Handler: 'sep-configuration.configureSEP',
      VpcConfig: {
        SubnetIds: [
          {
            Ref: 'VpcPrivateSubnet1Subnet536B997A',
          },
        ],
      },
    }));
  });
});
