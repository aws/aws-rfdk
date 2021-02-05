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
  IVersion,
  RenderQueue,
  Repository,
  SEPConfigurationSetup,
  VersionQuery,
} from '../lib';
import {
  SEPSpotFleet,
} from '../lib/sep-spotfleet';

describe('SEPConfigurationSetup', () => {
  let stack: Stack;
  let vpc: Vpc;
  let renderQueue: IRenderQueue;
  let version: IVersion;
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

    version = new VersionQuery(stack, 'Version');

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
      version,
      spotFleetOptions: {
        spotFleets: [
          fleet,
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
        version,
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
      version,
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
      version,
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

  describe('throws with wrong deadline version', () => {
    test.each([
      ['10.1.9'],
      ['10.1.10'],
    ])('%s', (versionString: string) => {
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      version = new VersionQuery(newStack, 'OldVersion', {
        version: versionString,
      });

      renderQueue = new RenderQueue(newStack, 'OldRenderQueue', {
        vpc,
        images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
        repository: new Repository(newStack, 'Repository', {
          vpc,
          version,
        }),
        version,
      });

      // THEN
      expect(() => {
        new SEPConfigurationSetup(newStack, 'SEPConfigurationSetup', {
          vpc,
          renderQueue: renderQueue,
          version,
          spotFleetOptions: {
            spotFleets: [
              fleet,
            ],
            groupPools,
          },
        });
      }).toThrowError(`Minimum supported Deadline version for SEPConfigurationSetup is 10.1.12.0. Received: ${versionString}.`);
    });
  });

  test('does not throw with min deadline version', () => {
    // GIVEN
    const versionString = '10.1.12';
    const newStack = new Stack(app, 'NewStack');
    version = new VersionQuery(newStack, 'OldVersion', {
      version: versionString,
    });

    renderQueue = new RenderQueue(newStack, 'OldRenderQueue', {
      vpc,
      images: { remoteConnectionServer: ContainerImage.fromAsset(__dirname) },
      repository: new Repository(newStack, 'Repository', {
        vpc,
        version,
      }),
      version,
    });

    // THEN
    expect(() => {
      new SEPConfigurationSetup(newStack, 'SEPConfigurationSetup', {
        vpc,
        renderQueue: renderQueue,
        version,
        spotFleetOptions: {
          spotFleets: [
            fleet,
          ],
          groupPools,
        },
      });
    }).not.toThrow();
  });
});
