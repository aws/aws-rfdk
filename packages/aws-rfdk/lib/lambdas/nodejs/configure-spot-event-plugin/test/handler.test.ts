/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstanceClass,
  InstanceSize,
  InstanceType,
} from '@aws-cdk/aws-ec2';
import { Expiration } from '@aws-cdk/core';
import * as AWS from 'aws-sdk';
import {
  SpotEventPluginDisplayInstanceStatus,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginState,
  SpotFleetAllocationStrategy,
  SpotFleetRequestType,
  SpotFleetResourceType,
} from '../../../../deadline';
import { SEPConfiguratorResource } from '../handler';
import {
  ConnectionOptions,
  SEPConfiguratorResourceProps,
  PluginSettings,
  SpotFleetRequestConfiguration,
  LaunchSpecification,
  SpotFleetRequestProps,
} from '../types';

jest.mock('../../lib/secrets-manager/read-certificate');

const secretArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

// @ts-ignore
async function successRequestMock(request: { [key: string]: string}, returnValue: any): Promise<{ [key: string]: any }> {
  return returnValue;
}

describe('SEPConfiguratorResource', () => {
  const validConnection: ConnectionOptions = {
    hostname: 'internal-hostname.com',
    protocol: 'HTTPS',
    port: '4433',
    caCertificateArn: secretArn,
  };

  const validLaunchSpecification: LaunchSpecification = {
    IamInstanceProfile: {
      Arn: 'iamInstanceProfileArn',
    },
    ImageId: 'any-ami',
    InstanceType: InstanceType.of(InstanceClass.T2, InstanceSize.SMALL).toString(),
    SecurityGroups: [{
      GroupId: 'sg-id',
    }],
    TagSpecifications: [{
      ResourceType: SpotFleetResourceType.INSTANCE,
      Tags: [
        {
          Key: 'name',
          Value: 'test',
        },
      ],
    }],
    UserData: 'userdata',
    KeyName: 'keyname',
    SubnetId: 'subnet-id',
    BlockDeviceMappings: [{
      DeviceName: 'device',
      NoDevice: '',
      VirtualName: 'virtualname',
      Ebs: {
        DeleteOnTermination: true,
        Encrypted: true,
        Iops: 10,
        SnapshotId: 'snapshot-id',
        VolumeSize: 10,
        VolumeType: 'volume-type',
      },
    }],
  };

  const validSpotFleetRequestProps: SpotFleetRequestProps = {
    AllocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
    IamFleetRole: 'roleArn',
    LaunchSpecifications: [validLaunchSpecification],
    ReplaceUnhealthyInstances: true,
    TargetCapacity: 1,
    TerminateInstancesWithExpiration: true,
    Type: SpotFleetRequestType.MAINTAIN,
    TagSpecifications: [{
      ResourceType: SpotFleetResourceType.SPOT_FLEET_REQUEST,
      Tags: [
        {
          Key: 'name',
          Value: 'test',
        },
      ],
    }],
    ValidUntil: Expiration.atDate(new Date(2022, 11, 17)).date.toUTCString(),
  };

  const validConvertedLaunchSpecifications = {
    BlockDeviceMappings: [{
      DeviceName: 'device',
      Ebs: {
        DeleteOnTermination: true,
        Encrypted: true,
        Iops: 10,
        SnapshotId: 'snapshot-id',
        VolumeSize: 10,
        VolumeType: 'volume-type',
      },
      NoDevice: '',
      VirtualName: 'virtualname',
    }],
    IamInstanceProfile: {
      Arn: 'iamInstanceProfileArn',
    },
    ImageId: 'any-ami',
    KeyName: 'keyname',
    SecurityGroups: [{
      GroupId: 'sg-id',
    }],
    SubnetId: 'subnet-id',
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: [
        {
          Key: 'name',
          Value: 'test',
        },
      ],
    }],
    UserData: 'userdata',
    InstanceType: 't2.small',
  };

  const validConvertedSpotFleetRequestProps = {
    AllocationStrategy: 'capacityOptimized',
    IamFleetRole: 'roleArn',
    LaunchSpecifications: [validConvertedLaunchSpecifications],
    ReplaceUnhealthyInstances: true,
    TargetCapacity: 1,
    TerminateInstancesWithExpiration: true,
    Type: 'maintain',
    ValidUntil: 'Sat, 17 Dec 2022 00:00:00 GMT',
    TagSpecifications: [{
      ResourceType: 'spot-fleet-request',
      Tags: [
        {
          Key: 'name',
          Value: 'test',
        },
      ],
    }],
  };

  const validSpotFleetRequestConfig: SpotFleetRequestConfiguration = {
    group_name1: validSpotFleetRequestProps,
  };

  const validConvertedSpotFleetRequestConfig = {
    group_name1: validConvertedSpotFleetRequestProps,
  };

  const validSpotEventPluginConfig: PluginSettings = {
    AWSInstanceStatus: SpotEventPluginDisplayInstanceStatus.DISABLED,
    DeleteInterruptedSlaves: true,
    DeleteTerminatedSlaves: true,
    IdleShutdown: 20,
    Logging: SpotEventPluginLoggingLevel.STANDARD,
    PreJobTaskMode: SpotEventPluginPreJobTaskMode.CONSERVATIVE,
    Region: 'us-west-2',
    ResourceTracker: true,
    StaggerInstances: 50,
    State: SpotEventPluginState.GLOBAL_ENABLED,
    StrictHardCap: true,
  };

  const validConvertedPluginConfig = {
    AWSInstanceStatus: 'Disabled',
    DeleteInterruptedSlaves: true,
    DeleteTerminatedSlaves: true,
    IdleShutdown: 20,
    Logging: 'Standard',
    PreJobTaskMode: 'Conservative',
    Region: 'us-west-2',
    ResourceTracker: true,
    StaggerInstances: 50,
    State: 'Global Enabled',
    StrictHardCap: true,
  };

  // Valid configurations
  const noPluginConfigs: SEPConfiguratorResourceProps = {
    connection: validConnection,
    spotFleetRequestConfigurations: validSpotFleetRequestConfig,
  };

  const noFleetRequestConfigs: SEPConfiguratorResourceProps = {
    spotPluginConfigurations: validSpotEventPluginConfig,
    connection: validConnection,
  };

  const allConfigs: SEPConfiguratorResourceProps = {
    spotPluginConfigurations: validSpotEventPluginConfig,
    connection: validConnection,
    spotFleetRequestConfigurations: validSpotFleetRequestConfig,
  };

  const noConfigs: SEPConfiguratorResourceProps = {
    connection: validConnection,
  };

  describe('doCreate', () => {
    let handler: SEPConfiguratorResource;
    let mockSpotEventPluginClient: { saveServerData: jest.Mock<any, any>; configureSpotEventPlugin: jest.Mock<any, any>; };

    beforeEach(() => {
      mockSpotEventPluginClient = {
        saveServerData: jest.fn(),
        configureSpotEventPlugin: jest.fn(),
      };

      handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockReturnValue(Promise.resolve('BEGIN CERTIFICATE'));

      async function returnSpotEventPluginClient(_v1: any): Promise<any> {
        return mockSpotEventPluginClient;
      }
      // eslint-disable-next-line dot-notation
      handler['spotEventPluginClient'] = jest.fn( (a) => returnSpotEventPluginClient(a) );
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('with no configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      const result = await handler.doCreate('physicalId', noConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(0);
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(0);
    });

    test('save spot fleet request configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      // WHEN
      const result = await handler.doCreate('physicalId', noPluginConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      const calledWithString = mockSaveServerData.mock.calls[0][0];
      const calledWithObject = JSON.parse(calledWithString);

      expect(calledWithObject).toEqual(validConvertedSpotFleetRequestConfig);
    });

    test('save spot fleet request configs without BlockDeviceMappings', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      const noEbs = {
        ...noPluginConfigs,
        spotFleetRequestConfigurations: {
          ...validSpotFleetRequestConfig,
          group_name1: {
            ...validSpotFleetRequestProps,
            LaunchSpecifications: [
              {
                ...validLaunchSpecification,
                BlockDeviceMappings: undefined,
              },
            ],
          },
        },
      };
      const convertedNoEbs = {
        ...validConvertedSpotFleetRequestConfig,
        group_name1: {
          ...validConvertedSpotFleetRequestProps,
          LaunchSpecifications: [
            {
              ...validConvertedLaunchSpecifications,
              BlockDeviceMappings: undefined,
            },
          ],
        },
      };

      // WHEN
      await handler.doCreate('physicalId', noEbs);
      const calledWithString = mockSaveServerData.mock.calls[0][0];
      const calledWithObject = JSON.parse(calledWithString);

      // THEN
      expect(calledWithObject).toEqual(convertedNoEbs);
    });

    test('save spot fleet request configs without Ebs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      const blockDevicesNoEbs = [{
        DeviceName: 'device',
      }];

      const noEbs = {
        ...noPluginConfigs,
        spotFleetRequestConfigurations: {
          ...validSpotFleetRequestConfig,
          group_name1: {
            ...validSpotFleetRequestProps,
            LaunchSpecifications: [
              {
                ...validLaunchSpecification,
                BlockDeviceMappings: blockDevicesNoEbs,
              },
            ],
          },
        },
      };
      const convertedNoEbs = {
        ...validConvertedSpotFleetRequestConfig,
        group_name1: {
          ...validConvertedSpotFleetRequestProps,
          LaunchSpecifications: [
            {
              ...validConvertedLaunchSpecifications,
              BlockDeviceMappings: blockDevicesNoEbs,
            },
          ],
        },
      };

      // WHEN
      await handler.doCreate('physicalId', noEbs);
      const calledWithString = mockSaveServerData.mock.calls[0][0];
      const calledWithObject = JSON.parse(calledWithString);

      // THEN
      expect(calledWithObject).toEqual(convertedNoEbs);
    });

    test('save spot event plugin configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validConvertedPluginConfig)) {
        configs.push({
          Key: key,
          Value: value,
        });
      }

      const securitySettings = [{
        Key: 'UseLocalCredentials',
        Value: true,
      },
      {
        Key: 'NamedProfile',
        Value: '',
      }];

      // WHEN
      const result = await handler.doCreate('physicalId', noFleetRequestConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([...configs, ...securitySettings]);
    });

    test('save both configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validConvertedPluginConfig)) {
        configs.push({
          Key: key,
          Value: value,
        });
      }

      const securitySettings = [{
        Key: 'UseLocalCredentials',
        Value: true,
      },
      {
        Key: 'NamedProfile',
        Value: '',
      }];

      // WHEN
      const result = await handler.doCreate('physicalId', allConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(validConvertedSpotFleetRequestConfig));

      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([...configs, ...securitySettings]);
    });

    test('throw when cannot save spot fleet request configs', async () => {
      // GIVEN
      async function returnFalse(_v1: any): Promise<boolean> {
        return false;
      }
      const mockSaveServerData = jest.fn( (a) => returnFalse(a) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      // WHEN
      const promise = handler.doCreate('physicalId', noPluginConfigs);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(/Failed to save spot fleet request with configuration/);
    });

    test('throw when cannot save spot event plugin configs', async () => {
      // GIVEN
      async function returnFalse(_v1: any): Promise<boolean> {
        return false;
      }
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnFalse(a) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      const promise = handler.doCreate('physicalId', noFleetRequestConfigs);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(/Failed to save Spot Event Plugin Configurations/);
    });
  });

  test('doDelete does not do anything', async () => {
    // GIVEN
    const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

    // WHEN
    const promise = await handler.doDelete('physicalId', noConfigs);

    // THEN
    await expect(promise).toBeUndefined();
  });

  describe('.validateInput()', () => {
    describe('should return true', () => {
      test.each<any>([
        allConfigs,
        noPluginConfigs,
        noFleetRequestConfigs,
        noConfigs,
      ])('with valid input', async (input: any) => {
        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });
    });

    // Invalid connection
    const noProtocolConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      port: '4433',
    };
    const noHostnameConnection = {
      protocol: 'HTTPS',
      port: '4433',
    };
    const noPortConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      caCertificateArn: secretArn,
    };
    const invalidHostnameConnection = {
      hostname: 10,
      protocol: 'HTTPS',
      port: '4433',
    };
    const invalidProtocolConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'TCP',
      port: '4433',
    };
    const invalidProtocolTypeConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: ['HTTPS'],
      port: '4433',
    };
    const invalidPortTypeConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: 4433,
    };
    const invalidPortRange1Connection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: '-1',
    };
    const invalidPortRange2Connection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: '65536',
    };
    const invalidPortRange3Connection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: Number.NaN.toString(),
    };
    const invalidCaCertConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: '4433',
      caCertificateArn: 'notArn',
    };

    describe('should return false if', () => {
      test.each<any>([
        noProtocolConnection,
        noHostnameConnection,
        noPortConnection,
        invalidCaCertConnection,
        invalidHostnameConnection,
        invalidProtocolConnection,
        invalidProtocolTypeConnection,
        invalidPortTypeConnection,
        invalidPortRange1Connection,
        invalidPortRange2Connection,
        invalidPortRange3Connection,
        undefined,
        [],
      ])('invalid connection', (invalidConnection: any) => {
        // GIVEN
        const input = {
          spotPluginConfigurations: validSpotEventPluginConfig,
          connection: invalidConnection,
          spotFleetRequestConfigurations: validSpotFleetRequestConfig,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeFalsy();
      });

      test.each<any>([
        undefined,
        [],
        '',
      ])('{input=%s}', (input) => {
        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeFalsy();
      });
    });
  });

  describe('.isSecretArnOrUndefined()', () => {
    describe('should return true if', () => {
      test.each<string | undefined>([
        secretArn,
        undefined,
      ])('{input=%s}', async (input: string | undefined) => {
        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

        // eslint-disable-next-line dot-notation
        const returnValue = handler['isSecretArnOrUndefined'](input);
        expect(returnValue).toBeTruthy();
      });
    });

    describe('should return false if', () => {
      test.each<any>([
        'any string',
        10,
        [],
      ])('{input=%s}', async (input: any) => {
        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

        // eslint-disable-next-line dot-notation
        const returnValue = handler['isSecretArnOrUndefined'](input);
        expect(returnValue).toBeFalsy();
      });
    });
  });

  describe('.spotEventPluginClient()', () => {
    test('creates a valid object with http', async () => {
      // GIVEN
      const validHTTPConnection: ConnectionOptions = {
        hostname: 'internal-hostname.com',
        protocol: 'HTTP',
        port: '8080',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      // eslint-disable-next-line dot-notation
      const result = await handler['spotEventPluginClient'](validHTTPConnection);

      expect(result).toBeDefined();
    });

    test('creates a valid object with https', async () => {
      // GIVEN
      const validHTTPSConnection: ConnectionOptions = {
        hostname: 'internal-hostname.com',
        protocol: 'HTTP',
        port: '8080',
        caCertificateArn: secretArn,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockReturnValue(Promise.resolve('BEGIN CERTIFICATE'));

      // eslint-disable-next-line dot-notation
      const result = await handler['spotEventPluginClient'](validHTTPSConnection);

      expect(result).toBeDefined();
    });
  });

  describe('.toPluginPropertyArray()', () => {
    test('converts to array of key value pairs', () => {
      // GIVEN
      const pluginConfig = {
        AWSInstanceStatus: 'Disabled',
      } as unknown;
      const expectedResult = {
        Key: 'AWSInstanceStatus',
        Value: 'Disabled',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      // eslint-disable-next-line dot-notation
      const returnValue = handler['toPluginPropertyArray'](pluginConfig as PluginSettings);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('throws with undefined values', () => {
      // GIVEN
      const pluginConfig = {
        AWSInstanceStatus: undefined,
      } as unknown;

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      function toPluginPropertyArray() {
        // eslint-disable-next-line dot-notation
        handler['toPluginPropertyArray'](pluginConfig as PluginSettings);
      }

      // THEN
      expect(toPluginPropertyArray).toThrowError();
    });
  });
});
