/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect as cdkExpect,
  haveResource,
  haveResourceLike,
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
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
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
  let fleetRole: Role;
  let fleet: SEPSpotFleet;
  let groupPools: {
    [groupName: string]: string[];
  };

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

    fleetRole = new Role(stack, 'FleetRole', {
      assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(stack, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
      ],
    });

    fleet = new SEPSpotFleet(stack, 'spotFleet1', {
      vpc,
      renderQueue: renderQueue,
      fleetRole,
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

    groupPools = {
      ['group_name1']: ['pool1', 'pool2'],
    };
  });

  test('created correctly', () => {
    // WHEN
    new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
      vpc,
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet, // TODO: Typescript is complaining
        ],
        groupPools,
      },
    });

    // THEN
    cdkExpect(stack).to(haveResource('Custom::RFDK_SEPConfigurationSetup', {
    }));
  });

  test('throws with the same group name', () => {
    // THEN
    expect(() => {
      new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
        vpc,
        renderQueue: renderQueue,
        spotFleetOptions: {
          spotFleets: [
            fleet,
            fleet,
          ],
          groupPools,
        },
      });
    }).toThrowError(/Bad Group Name: group_name1. Group names in Spot Fleet Request Configurations should be unique./);
  });

  test('use selected subnets', () => {
    // WHEN
    new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
      vpc,
      vpcSubnets: { subnets: [ vpc.privateSubnets[0] ] },
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet,
        ],
        groupPools,
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

  test('creates a custom resource', () => {
    // WHEN
    new SEPConfigurationSetup(stack, 'SEPConfigurationSetup', {
      vpc,
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet,
        ],
        groupPools,
      },
    });

    // THEN
    cdkExpect(stack).to(haveResource('Custom::RFDK_SEPConfigurationSetup'));
  });
});
