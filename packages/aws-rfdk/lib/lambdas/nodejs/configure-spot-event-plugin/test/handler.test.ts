/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import { InstanceClass, InstanceSize, InstanceType } from '@aws-cdk/aws-ec2';
import { Expiration } from '@aws-cdk/core';
import * as AWS from 'aws-sdk';
import {
  SpotEventPluginAwsInstanceStatus,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginSettings,
  SpotEventPluginState,
  SpotFleetAllocationStrategy,
  SpotFleetRequestConfiguration,
  SpotFleetRequestLaunchSpecification,
  SpotFleetRequestProps,
  SpotFleetRequestType,
  SpotFleetResourceType,
} from '../../../../deadline';
import { SEPConfiguratorResource } from '../handler';
import {
  ConnectionOptions,
  SEPConfiguratorResourceProps,
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

  const validSpotFleetRequestProps: SpotFleetRequestProps = {
    allocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
    iamFleetRole: 'roleArn',
    launchSpecifications: [],
    replaceUnhealthyInstances: true,
    targetCapacity: 1,
    terminateInstancesWithExpiration: true,
    type: SpotFleetRequestType.MAINTAIN,
    tagSpecifications: [{
      resourceType: SpotFleetResourceType.SPOT_FLEET_REQUEST,
      tags: [
        {
          Key: 'name',
          Value: 'test',
        },
      ],
    }],
    validUntil: Expiration.atDate(new Date(2022, 11, 17)).date.toUTCString(),
  };

  const validConvertedSpotFleetRequestProps = {
    AllocationStrategy: 'capacityOptimized',
    IamFleetRole: 'roleArn',
    LaunchSpecifications: [],
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

  const validSpotEventPluginConfig: SpotEventPluginSettings = {
    awsInstanceStatus: SpotEventPluginAwsInstanceStatus.DISABLED,
    deleteEC2SpotInterruptedWorkers: true,
    deleteSEPTerminatedWorkers: true,
    idleShutdown: 10,
    loggingLevel: SpotEventPluginLoggingLevel.STANDARD,
    preJobTaskMode: SpotEventPluginPreJobTaskMode.CONSERVATIVE,
    region: 'us-west-2',
    enableResourceTracker: true,
    maximumInstancesStartedPerCycle: 50,
    state: SpotEventPluginState.GLOBAL_ENABLED,
    strictHardCap: true,
  };

  const validConvertedPluginConfig = {
    AWSInstanceStatus: 'Disabled',
    DeleteInterruptedSlaves: true,
    DeleteTerminatedSlaves: true,
    IdleShutdown: 10,
    Logging: 'Standard',
    PreJobTaskMode: 'Conservative',
    Region: 'us-west-2',
    ResourceTracker: true,
    StaggerInstances: 50,
    State: 'Global Enabled',
    StrictHardCap: true,
    UseLocalCredentials: true,
    NamedProfile: '',
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
    let consoleLogMock: jest.SpyInstance<any, any>;
    let mockEventPluginRequests: { saveServerData: jest.Mock<any, any>; configureSpotEventPlugin: jest.Mock<any, any>; };

    beforeEach(() => {
      consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);

      mockEventPluginRequests = {
        saveServerData: jest.fn(),
        configureSpotEventPlugin: jest.fn(),
      };

      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockReturnValue(Promise.resolve('BEGIN CERTIFICATE'));

      async function returnSpotEventPluginRequests(_v1: any): Promise<any> {
        return mockEventPluginRequests;
      }
      // tslint:disable-next-line: no-string-literal
      handler['spotEventPluginRequests'] = jest.fn( (a) => returnSpotEventPluginRequests(a) );
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
      mockEventPluginRequests.saveServerData = mockSaveServerData;
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockEventPluginRequests.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

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
      mockEventPluginRequests.saveServerData = mockSaveServerData;

      // WHEN
      const result = await mockedHandler.doCreate('physicalId', noPluginConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(validConvertedSpotFleetRequestConfig));
    });

    test('save spot event plugin configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockEventPluginRequests.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validConvertedPluginConfig)) {
        configs.push({
          Key: key,
          Value: value,
        });
      }

      // WHEN
      const result = await mockedHandler.doCreate('physicalId', noFleetRequestConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual(configs);
    });

    test('save both configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockSaveServerData = jest.fn( (a) => returnTrue(a) );
      mockEventPluginRequests.saveServerData = mockSaveServerData;

      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockEventPluginRequests.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validConvertedPluginConfig)) {
        configs.push({
          Key: key,
          Value: value,
        });
      }

      // WHEN
      const result = await mockedHandler.doCreate('physicalId', allConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(validConvertedSpotFleetRequestConfig));

      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual(configs);
    });

    test('log when cannot save spot fleet request configs', async () => {
      // GIVEN
      async function returnFalse(_v1: any): Promise<boolean> {
        return false;
      }
      const mockSaveServerData = jest.fn( (a) => returnFalse(a) );
      mockEventPluginRequests.saveServerData = mockSaveServerData;

      // WHEN
      await mockedHandler.doCreate('physicalId', noPluginConfigs);

      // THEN
      expect(consoleLogMock.mock.calls.length).toBe(1);
      expect(consoleLogMock.mock.calls[0][0]).toMatch(/Failed to save spot fleet request with configuration/);
    });

    test('log when cannot save spot event plugin configs', async () => {
      // GIVEN
      async function returnFalse(_v1: any): Promise<boolean> {
        return false;
      }
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnFalse(a) );
      mockEventPluginRequests.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      await mockedHandler.doCreate('physicalId', noFleetRequestConfigs);

      // THEN
      expect(consoleLogMock.mock.calls.length).toBe(1);
      expect(consoleLogMock.mock.calls[0][0]).toMatch(/Failed to save Spot Event Plugin Configurations/);
    });
  });

  describe('.validateInput()', () => {
    describe('should return true if', () => {
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

  describe('.spotEventPluginRequests()', () => {
    test('creates a valid object with http', async () => {
      // GIVEN
      const validHTTPConnection: ConnectionOptions = {
        hostname: 'internal-hostname.com',
        protocol: 'HTTP',
        port: '8080',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const result = await handler['spotEventPluginRequests'](validHTTPConnection);

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

      const result = await handler['spotEventPluginRequests'](validHTTPSConnection);

      expect(result).toBeDefined();
    });
  });

  describe('.convertSpotEventPluginSettings()', () => {
    test('converts default', () => {
      // GIVEN
      const emptySpotEventPluginConfig: SpotEventPluginSettings = {};

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
        UseLocalCredentials: true,
        NamedProfile: '',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['convertSpotEventPluginSettings'](emptySpotEventPluginConfig);

      // THEN
      expect(returnValue).toEqual(defaultConvertedPluginConfig);
    });
  });

  describe('.convertSpotFleetRequestConfiguration()', () => {
    test('converts whole configuration with launch specification', () => {
      // GIVEN
      const launchSpecification: SpotFleetRequestLaunchSpecification = {
        iamInstanceProfile: {
          arn: 'iamInstanceProfileArn',
        },
        imageId: 'any-ami',
        instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
        securityGroups: [{
          groupId: 'sg-id',
        }],
        tagSpecifications: [{
          resourceType: SpotFleetResourceType.INSTANCE,
          tags: [
            {
              Key: 'name',
              Value: 'test',
            },
          ],
        }],
        userData: 'userdata',
        keyName: 'keyname',
        subnetId: 'subnet-id',
        blockDeviceMappings: [{
          deviceName: 'device',
          noDevice: true,
          virtualName: 'virtualname',
          ebs: {
            deleteOnTermination: true,
            encrypted: true,
            iops: 10,
            snapshotId: 'snapshot-id',
            volumeSize: 10,
            volumeType: 'volume-type',
          },
        }],
      };

      const propsWithLaunchSpecification: SpotFleetRequestProps = {
        ...validSpotFleetRequestProps,
        launchSpecifications: [
          launchSpecification,
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

  describe('.toKeyValueArray()', () => {
    test('converts to array of key value pairs', () => {
      // GIVEN
      const pluginConfig = {
        AWSInstanceStatus: 'Disabled',
      };
      const expectedResult = {
        Key: 'AWSInstanceStatus',
        Value: 'Disabled',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['toKeyValueArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('skips undefined values', () => {
      // GIVEN
      const pluginConfig = {
        AWSInstanceStatus: undefined,
      };
      const convertedResult1 = {
        Key: 'DeleteInterruptedSlaves',
        Value: undefined,
      };
      const convertedResult2 = {
        Key: 'DeleteInterruptedSlaves',
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['toKeyValueArray'](pluginConfig);

      // THEN
      expect(returnValue).not.toContainEqual(convertedResult1);
      expect(returnValue).not.toContainEqual(convertedResult2);
    });
  });
});
