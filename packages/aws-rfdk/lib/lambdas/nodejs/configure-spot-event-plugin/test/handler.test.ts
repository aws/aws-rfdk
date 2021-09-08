/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LaunchTemplate,
} from '@aws-cdk/aws-ec2';
import {
  App,
  Expiration,
  Stack,
} from '@aws-cdk/core';
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
} from '../types';

jest.mock('../../lib/secrets-manager/read-certificate');

const secretArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

describe('SEPConfiguratorResource', () => {
  const deadlineGroup = 'group_name';
  const deadlinePool =  'pool_name';

  let app: App;
  let stack: Stack;
  let validSepConfiguration: SEPConfiguratorResourceProps;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'Stack');
    const launchTemplate = new LaunchTemplate(stack, 'LaunchTemplate');

    validSepConfiguration = {
      spotPluginConfigurations: {
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
      },
      connection: {
        hostname: 'internal-hostname.com',
        protocol: 'HTTPS',
        port: '4433',
        caCertificateArn: secretArn,
      },
      spotFleetRequestConfigurations: {
        [deadlineGroup]: {
          AllocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
          IamFleetRole: 'roleArn',
          // Explicitly provide empty array for testing comparisons since we inject this for compatibility with SEP
          LaunchSpecifications: [],
          LaunchTemplateConfigs: [{
            LaunchTemplateSpecification: {
              LaunchTemplateId: launchTemplate.launchTemplateId,
              LaunchTemplateName: launchTemplate.launchTemplateName,
              Version: launchTemplate.versionNumber,
            },
            Overrides: [],
          }],
          ReplaceUnhealthyInstances: true,
          TargetCapacity: 1,
          TerminateInstancesWithExpiration: true,
          Type: SpotFleetRequestType.MAINTAIN,
          ValidUntil: Expiration.atDate(new Date(2022, 11, 17)).date.toISOString(),
          TagSpecifications: [{
            ResourceType: SpotFleetResourceType.SPOT_FLEET_REQUEST,
            Tags: [
              {
                Key: 'name',
                Value: 'test',
              },
            ],
          }],
        },
      },
      deadlineGroups: [deadlineGroup],
      deadlinePools: [deadlinePool],
    };
  });

  describe('doCreate', () => {
    let handler: SEPConfiguratorResource;
    let mockSpotEventPluginClient: {
      saveServerData: jest.Mock<any, any>;
      configureSpotEventPlugin: jest.Mock<any, any>;
      addGroups: jest.Mock<any, any>;
      addPools: jest.Mock<any, any>;
    };

    beforeEach(() => {
      mockSpotEventPluginClient = {
        saveServerData: jest.fn( (_a) => Promise.resolve(true) ),
        configureSpotEventPlugin: jest.fn( (_a) => Promise.resolve(true) ),
        addGroups: jest.fn( (_a) => Promise.resolve(true) ),
        addPools: jest.fn( (_a) => Promise.resolve(true) ),
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

    test('does not save server data when no configurations are provided', async () => {
      // GIVEN
      const mockSaveServerData = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;
      const mockConfigureSpotEventPlugin = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      const result = await handler.doCreate('physicalId', {
        connection: validSepConfiguration.connection,
      });

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(0);
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(0);
    });

    test('save spot fleet request configs', async () => {
      // GIVEN
      const mockSaveServerData = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      // WHEN
      const result = await handler.doCreate('physicalId', {
        ...validSepConfiguration,
        spotPluginConfigurations: undefined,
      });

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData).toBeCalledWith(JSON.stringify(validSepConfiguration.spotFleetRequestConfigurations));
    });

    test('save spot event plugin configs', async () => {
      // GIVEN
      const mockConfigureSpotEventPlugin = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validSepConfiguration.spotPluginConfigurations as any)) {
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
      const result = await handler.doCreate('physicalId', {
        ...validSepConfiguration,
        spotFleetRequestConfigurations: undefined,
      });

      // THEN
      expect(result).toBeUndefined();
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([...configs, ...securitySettings]);
    });

    test('save server data', async () => {
      // GIVEN
      const mockSaveServerData = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      // WHEN
      const result = await handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(validSepConfiguration.spotFleetRequestConfigurations));
    });

    test('configure spot event plugin', async () => {
      // GIVEN
      const mockConfigureSpotEventPlugin = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      const configs: { Key: string, Value: any }[] = [];
      for (const [key, value] of Object.entries(validSepConfiguration.spotPluginConfigurations as any)) {
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
      await handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([...configs, ...securitySettings]);
    });

    test('create groups', async () => {
      // GIVEN
      const mockAddGroups = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.addGroups = mockAddGroups;

      // WHEN
      await handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      expect(mockAddGroups.mock.calls.length).toBe(1);
      expect(mockAddGroups).toHaveBeenCalledWith([deadlineGroup]);
    });

    test('create pools', async () => {
      // GIVEN
      const mockAddPools = jest.fn( (_a) => Promise.resolve(true) );
      mockSpotEventPluginClient.addPools = mockAddPools;

      // WHEN
      await handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      expect(mockAddPools.mock.calls.length).toBe(1);
      expect(mockAddPools).toHaveBeenCalledWith([deadlinePool]);
    });

    test('throw when cannot add groups', async () => {
      // GIVEN
      mockSpotEventPluginClient.addGroups = jest.fn( (_a) => Promise.resolve(false) );

      // WHEN
      const promise = handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(`Failed to add Deadline group(s) ${validSepConfiguration.deadlineGroups}`);
    });

    test('throw when cannot add pools', async () => {
      // GIVEN
      mockSpotEventPluginClient.addPools = jest.fn( (_a) => Promise.resolve(false) );

      // WHEN
      const promise = handler.doCreate('physicalId', validSepConfiguration);

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(`Failed to add Deadline pool(s) ${validSepConfiguration.deadlinePools}`);
    });

    test('throw when cannot save spot fleet request configs', async () => {
      // GIVEN
      const mockSaveServerData = jest.fn( (_a) => Promise.resolve(false) );
      mockSpotEventPluginClient.saveServerData = mockSaveServerData;

      // WHEN
      const promise = handler.doCreate('physicalId', {
        connection: validSepConfiguration.connection,
        spotFleetRequestConfigurations: validSepConfiguration.spotFleetRequestConfigurations,
      });

      // THEN
      await expect(promise)
        .rejects
        .toThrowError(/Failed to save spot fleet request with configuration/);
    });

    test('throw when cannot save spot event plugin configs', async () => {
      // GIVEN
      const mockConfigureSpotEventPlugin = jest.fn( (_a) => Promise.resolve(false) );
      mockSpotEventPluginClient.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      const promise = handler.doCreate('physicalId', {
        connection: validSepConfiguration.connection,
        spotPluginConfigurations: validSepConfiguration.spotPluginConfigurations,
      });

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
    const promise = await handler.doDelete('physicalId', {
      connection: validSepConfiguration.connection,
    });

    // THEN
    await expect(promise).toBeUndefined();
  });

  describe('.validateInput()', () => {
    describe('should return true', () => {
      test('with valid input', async () => {
        // GIVEN
        const input = validSepConfiguration;

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });

      test('without spotPluginConfigurations', async () => {
        // GIVEN
        const input: SEPConfiguratorResourceProps = {
          ...validSepConfiguration,
          spotPluginConfigurations: undefined,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });

      test('without spotFleetRequestConfigurations', async () => {
        // GIVEN
        const input: SEPConfiguratorResourceProps = {
          ...validSepConfiguration,
          spotFleetRequestConfigurations: undefined,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });

      test('with only connection', async () => {
        // GIVEN
        const input: SEPConfiguratorResourceProps = {
          connection: validSepConfiguration.connection,
        };

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
          spotPluginConfigurations: validSepConfiguration.spotPluginConfigurations,
          connection: invalidConnection,
          spotFleetRequestConfigurations: validSepConfiguration.spotFleetRequestConfigurations,
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

  describe('.toKeyValueArray()', () => {
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
      const returnValue = handler['toKeyValueArray'](pluginConfig as PluginSettings);

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
      function toKeyValueArray() {
        // eslint-disable-next-line dot-notation
        handler['toKeyValueArray'](pluginConfig as PluginSettings);
      }

      // THEN
      expect(toKeyValueArray).toThrowError();
    });
  });
});
