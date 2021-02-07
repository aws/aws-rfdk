/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import * as AWS from 'aws-sdk';
import {
  ConnectionOptions,
  SEPConfiguratorResource,
} from '../handler';

jest.mock('../../lib/secrets-manager/read-certificate');

const secretArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

// @ts-ignore
async function successRequestMock(request: { [key: string]: string}, returnValue: any): Promise<{ [key: string]: any }> {
  return returnValue;
}

describe('SEPConfiguratorResource', () => {
  // Valid configurations
  const validSpotPluginConfig = {
    ResourceTracker: true,
  };
  const validConnection: ConnectionOptions = {
    hostname: 'internal-hostname.com',
    protocol: 'HTTPS',
    port: '4433',
    caCertificateArn: secretArn,
  };
  const validSpotFleetConfig = {
    group_name1: {
      AllocationStrategy: 'capacityOptimized',
    },
  };

  const allConfigs = {
    spotPluginConfigurations: validSpotPluginConfig,
    connection: validConnection,
    spotFleetRequestConfigurations: validSpotFleetConfig,
  };
  const noPluginConfigs = {
    connection: validConnection,
    spotFleetRequestConfigurations: validSpotFleetConfig,
  };
  const noFleetConfigs = {
    spotPluginConfigurations: validSpotPluginConfig,
    connection: validConnection,
  };
  const onlyConnection = {
    connection: validConnection,
  };

  describe('doCreate', () => {
    let consoleLogMock: jest.SpyInstance<any, any>;
    let mockedHandler: SEPConfiguratorResource;
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
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(noPluginConfigs.spotFleetRequestConfigurations));
    });

    test('save spot event plugin configs', async () => {
      // GIVEN
      async function returnTrue(_v1: any): Promise<boolean> {
        return true;
      }
      const mockConfigureSpotEventPlugin = jest.fn( (a) => returnTrue(a) );
      mockEventPluginRequests.configureSpotEventPlugin = mockConfigureSpotEventPlugin;

      // WHEN
      const result = await mockedHandler.doCreate('physicalId', noFleetConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toContainEqual({ Key: 'ResourceTracker', Value: true });
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

      // WHEN
      const result = await mockedHandler.doCreate('physicalId', allConfigs);

      // THEN
      expect(result).toBeUndefined();
      expect(mockSaveServerData.mock.calls.length).toBe(1);
      expect(mockSaveServerData.mock.calls[0][0]).toEqual(JSON.stringify(allConfigs.spotFleetRequestConfigurations));

      expect(mockConfigureSpotEventPlugin.mock.calls.length).toBe(1);
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toContainEqual({ Key: 'ResourceTracker', Value: true });
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
      await mockedHandler.doCreate('physicalId', noFleetConfigs);

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
        noFleetConfigs,
        onlyConnection,
      ])('with valid input', async (input: any) => {
        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeTruthy();
      });
    });

    // Invalid configurations
    const invalidSpotPluginConfig: any = [];
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
    const invalidSpotFleetConfig = '{ inValid: 10 }';

    describe('should return false if', () => {
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

      test('given invalid spot plugin config', () => {
        // GIVEN
        const input = {
          spotPluginConfigurations: invalidSpotPluginConfig,
          connection: validConnection,
          spotFleetRequestConfigurations: validSpotFleetConfig,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeFalsy();
      });

      test('given invalid spot fleet request config', () => {
        // GIVEN
        const input = {
          spotPluginConfigurations: validSpotPluginConfig,
          connection: validConnection,
          spotFleetRequestConfigurations: invalidSpotFleetConfig,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeFalsy();
      });

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
          spotPluginConfigurations: validSpotPluginConfig,
          connection: invalidConnection,
          spotFleetRequestConfigurations: validSpotFleetConfig,
        };

        // WHEN
        const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
        const returnValue = handler.validateInput(input);

        // THEN
        expect(returnValue).toBeFalsy();
      });

      describe('.implementsConnectionOptions()', () => {
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
          ])('invalid connection', (input: any) => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['implementsConnectionOptions'](input);

            // THEN
            expect(returnValue).toBeFalsy();
          });
        });

        describe('should return true if', () => {
          test('valid connection', () => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['implementsConnectionOptions'](validConnection);

            // THEN
            expect(returnValue).toBeTruthy();
          });
        });
      });

      describe('.isValidSFRConfig()', () => {
        describe('should return false if', () => {
          test.each<any>([
            10,
            [],
            'anystring',
          ])('{input=%s}', (input: any) => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['isValidSFRConfig'](input);

            // THEN
            expect(returnValue).toBeFalsy();
          });
        });

        describe('should return true if', () => {
          test.each<any>([
            { json: 'object' },
            undefined,
          ])('{input=%s}', (input: any) => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['isValidSFRConfig'](input);

            // THEN
            expect(returnValue).toBeTruthy();
          });
        });
      });

      describe('.isValidSpotPluginConfig()', () => {
        describe('should return false if', () => {
          test.each<any>([
            10,
            [],
            'string',
            invalidSpotPluginConfig,
          ])('{input=%s}', (input: any) => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['isValidSpotPluginConfig'](input);

            // THEN
            expect(returnValue).toBeFalsy();
          });
        });

        describe('should return true if', () => {
          test.each<any>([
            validSpotPluginConfig,
            undefined,
          ])('{input=%s}', (input: any) => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['isValidSpotPluginConfig'](input);

            // THEN
            expect(returnValue).toBeTruthy();
          });
        });
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

  describe('.spotFleetPluginConfigsToArray()', () => {
    test('converts DeleteInterruptedSlaves', () => {
      // GIVEN
      const pluginConfig = {
        DeleteInterruptedSlaves: 'true',
      };
      const expectedResult = {
        Key: 'DeleteInterruptedSlaves',
        Value: true,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('converts DeleteTerminatedSlaves', () => {
      // GIVEN
      const pluginConfig = {
        DeleteTerminatedSlaves: 'true',
      };
      const expectedResult = {
        Key: 'DeleteTerminatedSlaves',
        Value: true,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('converts IdleShutdown', () => {
      // GIVEN
      const pluginConfig = {
        IdleShutdown: '10',
      };
      const expectedResult = {
        Key: 'IdleShutdown',
        Value: 10,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('converts ResourceTracker', () => {
      // GIVEN
      const pluginConfig = {
        ResourceTracker: 'true',
      };
      const expectedResult = {
        Key: 'ResourceTracker',
        Value: true,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('converts StaggerInstances', () => {
      // GIVEN
      const pluginConfig = {
        StaggerInstances: 'true',
      };
      const expectedResult = {
        Key: 'StaggerInstances',
        Value: true,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('converts StrictHardCap', () => {
      // GIVEN
      const pluginConfig = {
        StrictHardCap: 'true',
      };
      const expectedResult = {
        Key: 'StrictHardCap',
        Value: true,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toContainEqual(expectedResult);
    });

    test('skips undefined values', () => {
      // GIVEN
      const pluginConfig = {
        DeleteInterruptedSlaves: undefined,
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
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).not.toContainEqual(convertedResult1);
      expect(returnValue).not.toContainEqual(convertedResult2);
    });
  });

  describe('.spotFleetRequestToString()', () => {
    test('converts TargetCapacity', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          TargetCapacity: '1',
        },
      };
      const expectedResult = {
        groupname: {
          TargetCapacity: 1,
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts ReplaceUnhealthyInstances', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          ReplaceUnhealthyInstances: 'true',
        },
      };
      const expectedResult = {
        groupname: {
          ReplaceUnhealthyInstances: true,
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts TerminateInstancesWithExpiration', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          TerminateInstancesWithExpiration: 'true',
        },
      };
      const expectedResult = {
        groupname: {
          TerminateInstancesWithExpiration: true,
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts whole BlockDeviceMappings', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              noDevice: 'true',
              ebs: {
                deleteOnTermination: 'true',
                encrypted: 'true',
                iops: '10',
                volumeSize: '10',
              },
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              noDevice: true,
              ebs: {
                deleteOnTermination: true,
                encrypted: true,
                iops: 10,
                volumeSize: 10,
              },
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts noDevice', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              noDevice: 'true',
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              noDevice: true,
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts deleteOnTermination', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                deleteOnTermination: 'true',
              },
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                deleteOnTermination: true,
              },
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts encrypted', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                encrypted: 'true',
              },
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                encrypted: true,
              },
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts volumeSize', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                volumeSize: '10',
              },
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                volumeSize: 10,
              },
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });

    test('converts iops', () => {
      // GIVEN
      const sfrConfig = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                iops: '10',
              },
            }],
          }],
        },
      };
      const expectedResult = {
        groupname: {
          LaunchSpecifications: [{
            BlockDeviceMappings: [{
              ebs: {
                iops: 10,
              },
            }],
          }],
        },
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetRequestToString'](sfrConfig);

      // THEN
      expect(JSON.parse(returnValue)).toEqual(expectedResult);
    });
  });
});
