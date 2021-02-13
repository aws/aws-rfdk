/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

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
      NoDevice: true,
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
      NoDevice: true,
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
    let mockedHandler: SEPConfiguratorResource;
    let mockSpotEventPluginClient: { saveServerData: jest.Mock<any, any>; configureSpotEventPlugin: jest.Mock<any, any>; };

    beforeEach(() => {
      mockSpotEventPluginClient = {
        saveServerData: jest.fn(),
        configureSpotEventPlugin: jest.fn(),
      };

      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockReturnValue(Promise.resolve('BEGIN CERTIFICATE'));

      async function returnSpotEventPluginClient(_v1: any): Promise<any> {
        return mockSpotEventPluginClient;
      }
      // tslint:disable-next-line: no-string-literal
      handler['spotEventPluginClient'] = jest.fn( (a) => returnSpotEventPluginClient(a) );
      mockedHandler = handler;
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
      const result = await mockedHandler.doCreate('physicalId', noConfigs);

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
      const result = await mockedHandler.doCreate('physicalId', noPluginConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      const calledWithString = mockSaveServerData.mock.calls[0][0];
      const calledWithObject = JSON.parse(calledWithString);

      expect(calledWithObject).toEqual(validConvertedSpotFleetRequestConfig);
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
      const result = await mockedHandler.doCreate('physicalId', noFleetRequestConfigs);

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
      const result = await mockedHandler.doCreate('physicalId', allConfigs);

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
      const promise = mockedHandler.doCreate('physicalId', noPluginConfigs);

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
      const promise = mockedHandler.doCreate('physicalId', noFleetRequestConfigs);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(/Failed to save Spot Event Plugin Configurations/);
    });
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

      const result = await handler['spotEventPluginClient'](validHTTPSConnection);

      expect(result).toBeDefined();
    });
  });

  describe('.convertSpotEventPluginSettings()', () => {
    test('does not convert properties with correct types', () => {
      // GIVEN
      const defaultPluginConfig = {
        AWSInstanceStatus: 'Disabled',
        DeleteInterruptedSlaves: false,
        DeleteTerminatedSlaves: false,
        IdleShutdown: 10,
        Logging: 'Standard',
        PreJobTaskMode: 'Conservative',
        Region: 'eu-west-1',
        ResourceTracker: true,
        StaggerInstances: 50,
        State: 'Disabled',
        StrictHardCap: false,
      };

      const defaultConvertedPluginConfig = {
        AWSInstanceStatus: 'Disabled',
        DeleteInterruptedSlaves: false,
        DeleteTerminatedSlaves: false,
        IdleShutdown: 10,
        Logging: 'Standard',
        PreJobTaskMode: 'Conservative',
        Region: 'eu-west-1',
        ResourceTracker: true,
        StaggerInstances: 50,
        State: 'Disabled',
        StrictHardCap: false,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['convertSpotEventPluginSettings'](defaultPluginConfig);

      // THEN
      expect(returnValue).toEqual(defaultConvertedPluginConfig);
    });

    test('converts properties of type string', () => {
      // GIVEN
      const defaultPluginConfig = {
        AWSInstanceStatus: 'Disabled',
        DeleteInterruptedSlaves: 'false',
        DeleteTerminatedSlaves: 'false',
        IdleShutdown: '10',
        Logging: 'Standard',
        PreJobTaskMode: 'Conservative',
        Region: 'eu-west-1',
        ResourceTracker: 'true',
        StaggerInstances: '50',
        State: 'Disabled',
        StrictHardCap: 'false',
      };

      const defaultConvertedPluginConfig = {
        AWSInstanceStatus: 'Disabled',
        DeleteInterruptedSlaves: false,
        DeleteTerminatedSlaves: false,
        IdleShutdown: 10,
        Logging: 'Standard',
        PreJobTaskMode: 'Conservative',
        Region: 'eu-west-1',
        ResourceTracker: true,
        StaggerInstances: 50,
        State: 'Disabled',
        StrictHardCap: false,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      // Need this trick so TS allows to pass config with string properties.
      const config = (defaultPluginConfig as unknown) as PluginSettings;
      const returnValue = handler['convertSpotEventPluginSettings'](config);

      // THEN
      expect(returnValue).toEqual(defaultConvertedPluginConfig);
    });
  });

  describe('.convertSpotFleetRequestConfiguration()', () => {
    test('converts whole configuration with launch specification', () => {
      // GIVEN
      const propsWithLaunchSpecification: SpotFleetRequestProps = {
        ...validSpotFleetRequestProps,
        LaunchSpecifications: [
          validLaunchSpecification,
        ],
      };

      const requestConfigWithLaunchSpecification: SpotFleetRequestConfiguration = {
        group_name1: propsWithLaunchSpecification,
      };

      const convertedPropsWithLaunchSpecification = {
        ...validConvertedSpotFleetRequestProps,
        LaunchSpecifications: [{
          IamInstanceProfile: {
            Arn: 'iamInstanceProfileArn',
          },
          ImageId: 'any-ami',
          InstanceType: 't2.small',
          SecurityGroups: [{
            GroupId: 'sg-id',
          }],
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
          KeyName: 'keyname',
          SubnetId: 'subnet-id',
          BlockDeviceMappings: [{
            DeviceName: 'device',
            NoDevice: true,
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
        }],
      };

      const convertedRequestConfigWithLaunchSpecification = {
        group_name1: convertedPropsWithLaunchSpecification,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['convertSpotFleetRequestConfiguration'](requestConfigWithLaunchSpecification);

      // THEN
      expect(returnValue).toEqual(convertedRequestConfigWithLaunchSpecification);
    });
  });

  describe('.toPluginPropertyArray()', () => {
    test('converts to array of key value pairs', () => {
      // // GIVEN
      // const pluginConfig = {
      //   AWSInstanceStatus: 'Disabled',
      // };
      // const expectedResult = {
      //   Key: 'AWSInstanceStatus',
      //   Value: 'Disabled',
      // };

      // // WHEN
      // const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      // const returnValue = handler['toPluginPropertyArray'](pluginConfig);

      // // THEN
      // expect(returnValue).toContainEqual(expectedResult);
    });

    test('skips undefined values', () => {
      // TODO
      // // GIVEN
      // const pluginConfig = {
      //   AWSInstanceStatus: undefined,
      // };
      // const convertedResult1 = {
      //   Key: 'DeleteInterruptedSlaves',
      //   Value: undefined,
      // };
      // const convertedResult2 = {
      //   Key: 'DeleteInterruptedSlaves',
      // };

      // // WHEN
      // const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      // const returnValue = handler['toPluginPropertyArray'](pluginConfig);

      // // THEN
      // expect(returnValue).not.toContainEqual(convertedResult1);
      // expect(returnValue).not.toContainEqual(convertedResult2);
    });
  });

  describe('.convertToInt()', () => {
    test.each<[any, number]>([
      ['10', 10],
      [10, 10],
    ])('correctly converts %p to %p', (input: any, expected: number | undefined) => {
      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['convertToInt'](input, 'propertyName');

      // THEN
      expect(returnValue).toBe(expected);
    });

    test.each([
      10.6,
      [],
      {},
      'string',
      undefined,
    ])('throws an error with %p', input => {
      // WHEN
      const propertyName = 'propertyName';
      function convertToInt() {
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        handler['convertToInt'](input, propertyName);
      }

      // THEN
      expect(convertToInt).toThrowError(`The value of ${propertyName} should be an integer. Received: ${input}`);
    });
  });

  describe('.convertToBoolean()', () => {
    test.each<[any, boolean]>([
      [true, true],
      ['true', true],
      [false, false],
      ['false', false],
    ])('correctly converts %p to %p', (input: any, expected: boolean | undefined) => {
      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['convertToBoolean'](input, 'property');

      // THEN
      expect(returnValue).toBe(expected);
    });

    test.each([
      10.6,
      [],
      {},
      'string',
      undefined,
    ])('throws an error with %p', input => {
      // WHEN
      const propertyName = 'propertyName';
      function convertToBoolean() {
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        handler['convertToBoolean'](input, propertyName);
      }

      // THEN
      expect(convertToBoolean).toThrowError(`The value of ${propertyName} should be a boolean. Received: ${input}`);
    });
  });
});
