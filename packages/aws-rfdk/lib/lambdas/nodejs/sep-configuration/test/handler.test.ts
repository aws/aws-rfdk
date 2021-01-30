/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
import {
  IConnectionOptions,
  SEPConfiguratorResource,
} from '../handler';

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
  const validConnection: IConnectionOptions = {
    hostname: 'internal-hostname.com',
    protocol: 'HTTPS',
    port: '4433',
    caCertificate: secretArn,
    passphrase: secretArn,
    pfxCertificate: secretArn,
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
      // tslint:disable-next-line: no-string-literal
      handler['readCertificateData'] = jest.fn();
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
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([{ Key: 'ResourceTracker', Value: true }]);
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
      expect(mockConfigureSpotEventPlugin.mock.calls[0][0]).toEqual([{ Key: 'ResourceTracker', Value: true }]);
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

  describe('readCertificateData', () => {
    beforeEach(() => {
      setSDKInstance(AWS);
    });

    afterEach(() => {
      restore('SecretsManager');
    });

    test('success', async () => {
      // GIVEN
      const certData = 'BEGIN CERTIFICATE';
      const secretContents = {
        SecretString: certData,
      };
      const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
      mock('SecretsManager', 'getSecretValue', mockGetSecret);
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      // WHEN
      // tslint:disable-next-line: no-string-literal
      const data = await handler['readCertificateData'](secretArn);

      // THEN
      expect(data).toStrictEqual(certData);
    });

    test('not a certificate', async () => {
      // GIVEN
      const certData = 'NOT A CERTIFICATE';
      const secretContents = {
        SecretString: certData,
      };
      const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
      mock('SecretsManager', 'getSecretValue', mockGetSecret);
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      // THEN
      // tslint:disable-next-line: no-string-literal
      await expect(handler['readCertificateData'](secretArn)).rejects.toThrowError(/must contain a Certificate in PEM format/);
    });

    test('binary data', async () => {
      // GIVEN
      const certData = Buffer.from('BEGIN CERTIFICATE', 'utf-8');
      const secretContents = {
        SecretBinary: certData,
      };
      const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
      mock('SecretsManager', 'getSecretValue', mockGetSecret);
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());

      // THEN
      // tslint:disable-next-line: no-string-literal
      await expect(handler['readCertificateData'](secretArn)).rejects.toThrowError(/must contain a Certificate in PEM format/);
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
      caCertificate: secretArn,
      passphrase: secretArn,
      pfxCertificate: secretArn,
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
      caCertificate: 'notArn',
    };
    const invalidPassphraseConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: '4433',
      passphrase: 'notArn',
    };
    const invalidPfxConnection = {
      hostname: 'internal-hostname.us-east-1.elb.amazonaws.com',
      protocol: 'HTTPS',
      port: '4433',
      pfxCertificate: 'notArn',
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
        invalidPassphraseConnection,
        invalidPfxConnection,
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

      describe('.implementsIConnectionOptions()', () => {
        describe('should return false if', () => {
          test.each<any>([
            noProtocolConnection,
            noHostnameConnection,
            noPortConnection,
            invalidCaCertConnection,
            invalidPassphraseConnection,
            invalidPfxConnection,
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
            const returnValue = handler['implementsIConnectionOptions'](input);

            // THEN
            expect(returnValue).toBeFalsy();
          });
        });

        describe('should return true if', () => {
          test('valid connection', () => {
            // WHEN
            const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
            const returnValue = handler['implementsIConnectionOptions'](validConnection);

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
      const validHTTPConnection: IConnectionOptions = {
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
      const validHTTPSConnection: IConnectionOptions = {
        hostname: 'internal-hostname.com',
        protocol: 'HTTP',
        port: '8080',
        caCertificate: secretArn,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      async function returnCerificateContent(_v1: any): Promise<any> {
        return 'BEGIN CERTIFICATE';
      }
      // tslint:disable-next-line: no-string-literal
      handler['readCertificateData'] = jest.fn( (a) => returnCerificateContent(a) );
      const result = await handler['spotEventPluginRequests'](validHTTPSConnection);

      expect(result).toBeDefined();
    });
  });

  describe('.spotFleetPluginConfigsToArray()', () => {
    test('converts DeleteInterruptedSlaves', () => {
      // GIVEN
      let pluginConfig = {
        DeleteInterruptedSlaves: 'true',
      };
      const expectedResult = [{
        Key: 'DeleteInterruptedSlaves',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts DeleteTerminatedSlaves', () => {
      // GIVEN
      let pluginConfig = {
        DeleteTerminatedSlaves: 'true',
      };
      const expectedResult = [{
        Key: 'DeleteTerminatedSlaves',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts IdleShutdown', () => {
      // GIVEN
      let pluginConfig = {
        IdleShutdown: '10',
      };
      const expectedResult = [{
        Key: 'IdleShutdown',
        Value: 10,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts ResourceTracker', () => {
      // GIVEN
      let pluginConfig = {
        ResourceTracker: 'true',
      };
      const expectedResult = [{
        Key: 'ResourceTracker',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts StaggerInstances', () => {
      // GIVEN
      let pluginConfig = {
        StaggerInstances: 'true',
      };
      const expectedResult = [{
        Key: 'StaggerInstances',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts StrictHardCap', () => {
      // GIVEN
      let pluginConfig = {
        StrictHardCap: 'true',
      };
      const expectedResult = [{
        Key: 'StrictHardCap',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('converts UseLocalCredentials', () => {
      // GIVEN
      let pluginConfig = {
        UseLocalCredentials: 'true',
      };
      const expectedResult = [{
        Key: 'UseLocalCredentials',
        Value: true,
      }];

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual(expectedResult);
    });

    test('skips undefined values', () => {
      // GIVEN
      let pluginConfig = {
        DeleteInterruptedSlaves: undefined,
      };

      // WHEN
      const handler = new SEPConfiguratorResource(new AWS.SecretsManager());
      const returnValue = handler['spotFleetPluginConfigsToArray'](pluginConfig);

      // THEN
      expect(returnValue).toEqual([]);
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
