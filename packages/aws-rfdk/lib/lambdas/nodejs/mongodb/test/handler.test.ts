/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';

import { MongoDbConfigure } from '../handler';

jest.mock('../../lib/secrets-manager/read-certificate');

const secretArn: string = 'arn:aws:secretsmanager:us-west-1:1234567890:secret:SecretPath/Cert';

// @ts-ignore
async function successRequestMock(request: { [key: string]: string}, returnValue: any): Promise<{ [key: string]: any }> {
  return returnValue;
}

describe('readCertificateData', () => {
  test('success', async () => {
    // GIVEN
    const certData = 'BEGIN CERTIFICATE';
    jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockReturnValue(Promise.resolve(certData));
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const data = await handler['readCertificateData'](secretArn);

    // THEN
    expect(data).toStrictEqual(certData);
  });

  test('failure', async () => {
    // GIVEN
    jest.requireMock('../../lib/secrets-manager/read-certificate').readCertificateData.mockImplementation(() => {
      throw new Error('must contain a Certificate in PEM format');
    });
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['readCertificateData'](secretArn)).rejects.toThrowError(/must contain a Certificate in PEM format/);
  });
});

describe('readLoginCredentials', () => {
  beforeEach(() => {
    setSDKInstance(AWS);
  });

  afterEach(() => {
    restore('SecretsManager');
  });

  test('success', async () => {
    // GIVEN
    const loginData = {
      username: 'testuser',
      password: 'testpassword',
    };
    const secretContents = {
      SecretString: JSON.stringify(loginData),
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const data = await handler['readLoginCredentials'](secretArn);

    // THEN
    expect(data).toStrictEqual(loginData);
  });

  test('binary data', async () => {
    // GIVEN
    const loginData = Buffer.from('some binary data', 'utf-8');
    const secretContents = {
      SecretBinary: loginData,
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['readLoginCredentials'](secretArn)).rejects.toThrowError(/must be a JSON encoded string/);
  });

  test.each([
    [ '}{', /Failed to parse JSON in MongoDB login credentials/ ],
    [
      JSON.stringify({
        password: 'testpassword',
      }),
      /is missing: username/,
    ],
    [
      JSON.stringify({
        username: 'testuser',
      }),
      /is missing: password/,
    ],
  ])('failed: %p to get %p', async (data: string, expected: RegExp) => {
    // GIVEN
    const secretContents = {
      SecretString: data,
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['readLoginCredentials'](secretArn)).rejects.toThrowError(expected);
  });
});

describe('mongoLogin', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mongoLogin', async () => {
    // GIVEN
    async function stringSuccessRequestMock(value: string): Promise<string> {
      return value;
    }
    const mockReadCert = jest.fn( (request) => stringSuccessRequestMock(request) );
    const mockReadLogin = jest.fn( (request) => successRequestMock(request, { username: 'test', password: 'pass' }));
    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    // tslint:disable-next-line: no-string-literal
    handler['readCertificateData'] = mockReadCert;
    // tslint:disable-next-line: no-string-literal
    handler['readLoginCredentials'] = mockReadLogin;
    const mockDriver = {
      MongoClient: {
        connect: jest.fn(),
      },
    };
    const loginOptions = {
      Hostname: 'testhostname',
      Port: '27017',
      Credentials: 'some credentials',
      CaCertificate: 'cert arn',
    };

    // WHEN
    // tslint:disable-next-line: no-string-literal
    await handler['mongoLogin'](mockDriver, loginOptions);

    // THEN
    expect(mockReadCert.mock.calls.length).toBe(1);
    expect(mockReadCert.mock.calls[0][0]).toStrictEqual(loginOptions.CaCertificate);
    expect(mockReadLogin.mock.calls.length).toBe(1);
    expect(mockReadLogin.mock.calls[0][0]).toStrictEqual(loginOptions.Credentials);
    expect(mockDriver.MongoClient.connect.mock.calls.length).toBe(1);
    expect(mockDriver.MongoClient.connect.mock.calls[0][0]).toStrictEqual('mongodb://testhostname:27017');
    expect(mockDriver.MongoClient.connect.mock.calls[0][1]).toStrictEqual({
      tls: true,
      tlsInsecure: false,
      tlsCAFile: '/tmp/ca.crt',
      auth: {
        user: 'test',
        password: 'pass',
      },
      useUnifiedTopology: true,
    });
  });
});

describe('readPasswordAuthUserInfo', () => {
  beforeEach(() => {
    setSDKInstance(AWS);
  });

  afterEach(() => {
    restore('SecretsManager');
  });

  test('success', async () => {
    // GIVEN
    const userData = {
      username: 'testuser',
      password: 'testpassword',
      roles: [ { role: 'readWrite', db: 'somedb' } ],
    };
    const secretContents = {
      SecretString: JSON.stringify(userData),
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const data = await handler['readPasswordAuthUserInfo'](secretArn);

    // THEN
    expect(data).toStrictEqual(userData);
  });

  test('binary data', async () => {
    // GIVEN
    const loginData = Buffer.from('Some binary data', 'utf-8');
    const secretContents = {
      SecretBinary: loginData,
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['readPasswordAuthUserInfo'](secretArn)).rejects.toThrowError(/must be a JSON encoded string/);
  });

  test.each([
    [ '}{', /Failed to parse JSON for password-auth user Secret/ ],
    [
      JSON.stringify({
        password: 'testpassword',
        roles: [ { role: 'readWrite', db: 'somedb' } ],
      }),
      /is missing: username/,
    ],
    [
      JSON.stringify({
        username: 'testuser',
        roles: [ { role: 'readWrite', db: 'somedb' } ],
      }),
      /is missing: password/,
    ],
    [
      JSON.stringify({
        username: 'testuser',
        password: 'testpassword',
      }),
      /is missing: roles/,
    ],
  ])('failed: %p to get %p', async (data: string, expected: RegExp) => {
    // GIVEN
    const secretContents = {
      SecretString: data,
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['readPasswordAuthUserInfo'](secretArn)).rejects.toThrowError(expected);
  });
});

describe('userExists', () => {
  test('user exists', async () => {
    // GIVEN
    const mongoQueryResult = {
      users: [
        {
          _id: 'admin.test',
          user: 'test',
          db: 'admin',
        },
      ],
      ok: 1,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const exists = await handler['userExists'](mockDb, 'test');

    // THEN
    expect(mockDb.command.mock.calls.length).toBe(1);
    expect(mockDb.command.mock.calls[0][0]).toStrictEqual({
      usersInfo: 'test',
    });
    expect(exists).toStrictEqual(true);
  });

  test('user does not exists', async () => {
    // GIVEN
    const mongoQueryResult = {
      users: [],
      ok: 1,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const exists = await handler['userExists'](mockDb, 'test');

    // THEN
    expect(exists).toStrictEqual(false);
  });

  test('request failed', async () => {
    // GIVEN
    const mongoQueryResult = {
      users: [],
      ok: 0,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['userExists'](mockDb, 'test')).rejects.toThrowError(/MongoDB error checking whether user exists 'test'/);
  });
});

describe('createUser', () => {
  let consoleLogMock: jest.SpyInstance<any, any>;

  beforeEach(() => {
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('create success with password', async () => {
    // GIVEN
    const mongoQueryResult = {
      ok: 1,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    const credentials = {
      username: 'test',
      password: 'password',
      roles: [ { role: 'readWrite', db: 'testdb' } ],
    };

    // WHEN
    // tslint:disable-next-line: no-string-literal
    await handler['createUser'](mockDb, credentials);

    // THEN
    expect(mockDb.command.mock.calls.length).toBe(1);
    expect(mockDb.command.mock.calls[0][0]).toStrictEqual({
      createUser: credentials.username,
      pwd: credentials.password,
      roles: credentials.roles,
    });
    expect(consoleLogMock.mock.calls.length).toBe(1);
    expect(consoleLogMock.mock.calls[0][0]).toStrictEqual('Creating user: test');
  });

  test('create success no password', async () => {
    // GIVEN
    const mongoQueryResult = {
      ok: 1,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    const credentials = {
      username: 'test',
      roles: [ { role: 'readWrite', db: 'testdb' } ],
    };

    // WHEN
    // tslint:disable-next-line: no-string-literal
    await handler['createUser'](mockDb, credentials);

    // THEN
    expect(mockDb.command.mock.calls.length).toBe(1);
    expect(mockDb.command.mock.calls[0][0]).toStrictEqual({
      createUser: credentials.username,
      roles: credentials.roles,
    });
    expect(consoleLogMock.mock.calls.length).toBe(1);
    expect(consoleLogMock.mock.calls[0][0]).toStrictEqual('Creating user: test');
  });

  test('request failed', async () => {
    // GIVEN
    const mongoQueryResult = {
      ok: 0,
    };
    const mockDb = {
      command: jest.fn( (request) => successRequestMock(request, mongoQueryResult) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    const credentials = {
      username: 'test',
      password: 'password',
      roles: [ { role: 'readWrite', db: 'testdb' } ],
    };

    // THEN
    // tslint:disable-next-line: no-string-literal
    await expect(handler['createUser'](mockDb, credentials)).rejects.toThrowError(/MongoDB error when adding user 'test'/);
  });
});

describe('createPasswordAuthUser', () => {
  let consoleLogMock: jest.SpyInstance<any, any>;

  beforeEach(() => {
    setSDKInstance(AWS);
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    restore('SecretsManager');
    jest.clearAllMocks();
  });

  test.each([
    [
      [], true,
    ],
    [
      [
        {
          _id: 'admin.test',
          user: 'test',
          db: 'admin',
        },
      ],
      false,
    ],
  ])('userExists %p gives %p', async (userExists: any, expected: boolean) => {
    // GIVEN
    const userData = {
      username: 'testuser',
      password: 'testpassword',
      roles: [ { role: 'readWrite', db: 'somedb' } ],
    };
    const secretContents = {
      SecretString: JSON.stringify(userData),
    };
    const mockGetSecret = jest.fn( (request) => successRequestMock(request, secretContents) );
    mock('SecretsManager', 'getSecretValue', mockGetSecret);
    const userExistsResponse = {
      users: userExists,
      ok: 1,
    };
    const addUserResponse = {
      ok: 1,
    };
    async function commandMock(request: { [key: string]: string}): Promise<{ [key: string]: any }> {
      if ('createUser' in request) {
        return addUserResponse;
      }
      return userExistsResponse;
    }
    const mockDb = {
      command: jest.fn( (request) => commandMock(request) ),
    };
    const handler = new MongoDbConfigure(new AWS.SecretsManager());

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const result = await handler['createPasswordAuthUser'](mockDb, secretArn);

    // THEN
    expect(result).toStrictEqual(expected);
    expect(mockDb.command.mock.calls.length).toBe(expected ? 2 : 1);
    // Check args of userExits DB query.
    expect(mockDb.command.mock.calls[0][0]).toStrictEqual({
      usersInfo: userData.username,
    });
    if (expected) {
      // Check args of createUser DB query.
      expect(mockDb.command.mock.calls[1][0]).toStrictEqual({
        createUser: userData.username,
        pwd: userData.password,
        roles: userData.roles,
      });
      expect(consoleLogMock.mock.calls.length).toBe(1);
      expect(consoleLogMock.mock.calls[0][0]).toStrictEqual(`Creating user: ${userData.username}`);
    }
  });
});

describe('createX509AuthUser', () => {
  let consoleLogMock: jest.SpyInstance<any, any>;

  beforeEach(() => {
    setSDKInstance(AWS);
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    restore('SecretsManager');
  });

  test.each([
    [
      [], true,
    ],
    [
      [
        {
          _id: '$external.CN=myName,OU=myOrgUnit,O=myOrg',
          user: 'CN=myName,OU=myOrgUnit,O=myOrg',
          db: '$external',
        },
      ],
      false,
    ],
  ])('userExists %p gives %p', async (userExists: any, expected: boolean) => {
    // GIVEN
    const username = 'CN=TestUser,O=TestOrg,OU=TestOrgUnit';
    const userExistsResponse = {
      users: userExists,
      ok: 1,
    };
    const addUserResponse = {
      ok: 1,
    };
    async function commandMock(request: { [key: string]: string}): Promise<{ [key: string]: any }> {
      if ('createUser' in request) {
        return addUserResponse;
      }
      return userExistsResponse;
    }
    const mockDb = {
      command: jest.fn( (request) => commandMock(request) ),
    };
    async function stringSuccessRequestMock(value: string): Promise<string> {
      return value;
    }
    async function rfc2253(_arg: string): Promise<string> {
      return username;
    }
    const mockReadCert = jest.fn( (request) => stringSuccessRequestMock(request) );
    const mockRfc2253 = jest.fn( (arg) => rfc2253(arg) );
    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    // tslint:disable-next-line: no-string-literal
    handler['readCertificateData'] = mockReadCert;
    // tslint:disable-next-line: no-string-literal
    handler['retrieveRfc2253Subject'] = mockRfc2253;
    const userData = {
      certificate: secretArn,
      roles: [ { role: 'readWrite', db: 'somedb' } ],
    };
    const userToCreate = {
      Certificate: userData.certificate,
      Roles: JSON.stringify(userData.roles),
    };

    // WHEN
    // tslint:disable-next-line: no-string-literal
    const result = await handler['createX509AuthUser'](mockDb, userToCreate);

    // THEN
    expect(result).toStrictEqual(expected);
    expect(mockDb.command.mock.calls.length).toBe(expected ? 2 : 1);
    // Check args of userExits DB query.
    expect(mockDb.command.mock.calls[0][0]).toStrictEqual({
      usersInfo: username,
    });
    if (expected) {
      // Check args of createUser DB query.
      expect(mockDb.command.mock.calls[1][0]).toStrictEqual({
        createUser: username,
        roles: userData.roles,
      });
      expect(consoleLogMock.mock.calls.length).toBe(1);
      expect(consoleLogMock.mock.calls[0][0]).toStrictEqual(`Creating user: ${username}`);
    }
  });
});

describe('doCreate', () => {
  let consoleLogMock: jest.SpyInstance<any, any>;
  let mockedHandler: MongoDbConfigure;
  let mockMongoClient: { db: jest.Mock<any, any>; close: jest.Mock<any, any>; };

  beforeEach(() => {
    consoleLogMock = jest.spyOn(console, 'log').mockReturnValue(undefined);

    mockMongoClient = {
      db: jest.fn(),
      close: jest.fn(),
    };

    const handler = new MongoDbConfigure(new AWS.SecretsManager());
    // tslint:disable-next-line: no-string-literal
    handler['installMongoDbDriver'] = jest.fn();
    async function returnMockMongoClient(_v1: any, _v2: any): Promise<any> {
      return mockMongoClient;
    }
    // tslint:disable-next-line: no-string-literal
    handler['mongoLogin'] = jest.fn( (a, b) => returnMockMongoClient(a, b) );
    mockedHandler = handler;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('create password auth user', async () => {
    // GIVEN
    async function returnTrue(_v1: any, _v2: any): Promise<boolean> {
      return true;
    }
    const mockCreatePwAuthUser = jest.fn( (a, b) => returnTrue(a, b) );
    // tslint:disable-next-line: no-string-literal
    mockedHandler['createPasswordAuthUser'] = mockCreatePwAuthUser;
    const properties = {
      Connection: {
        Hostname: 'testhost',
        Port: '27017',
        Credentials: 'credentialArn',
        CaCertificate: 'certArn',
      },
      PasswordAuthUsers: [ 'arn1', 'arn2' ],
    };

    // WHEN
    const result = await mockedHandler.doCreate('physicalId', properties);

    // THEN
    expect(result).toBeUndefined();
    expect(mockCreatePwAuthUser.mock.calls.length).toBe(2);
    expect(mockCreatePwAuthUser.mock.calls[0][1]).toBe('arn1');
    expect(mockCreatePwAuthUser.mock.calls[1][1]).toBe('arn2');
  });

  test('log when cannot create password auth user', async () => {
    // GIVEN
    async function returnFalse(_v1: any, _v2: any): Promise<boolean> {
      return false;
    }
    const mockCreatePwAuthUser = jest.fn( (a, b) => returnFalse(a, b) );
    // tslint:disable-next-line: no-string-literal
    mockedHandler['createPasswordAuthUser'] = mockCreatePwAuthUser;
    const properties = {
      Connection: {
        Hostname: 'testhost',
        Port: '27017',
        Credentials: 'credentialArn',
        CaCertificate: 'certArn',
      },
      PasswordAuthUsers: [ 'arn1' ],
    };

    // WHEN
    await mockedHandler.doCreate('physicalId', properties);

    // THEN
    expect(consoleLogMock.mock.calls.length).toBe(2);
    expect(consoleLogMock.mock.calls[0][0]).toMatch(/No action performed for this user./);
  });

  test('create x509 auth user', async () => {
    // GIVEN
    async function returnTrue(_v1: any, _v2: any): Promise<boolean> {
      return true;
    }
    const mockCreateAuthUser = jest.fn( (a, b) => returnTrue(a, b) );
    // tslint:disable-next-line: no-string-literal
    mockedHandler['createX509AuthUser'] = mockCreateAuthUser;
    const properties = {
      Connection: {
        Hostname: 'testhost',
        Port: '27017',
        Credentials: 'credentialArn',
        CaCertificate: 'certArn',
      },
      X509AuthUsers: [
        {
          Certificate: 'some arn1',
          Roles: 'json encoded role',
        },
        {
          Certificate: 'some arn2',
          Roles: 'json encoded role',
        },
      ],
    };

    // WHEN
    const result = await mockedHandler.doCreate('physicalId', properties);

    // THEN
    expect(result).toBeUndefined();
    expect(mockCreateAuthUser.mock.calls.length).toBe(2);
    expect(mockCreateAuthUser.mock.calls[0][1]).toStrictEqual(properties.X509AuthUsers[0]);
    expect(mockCreateAuthUser.mock.calls[1][1]).toStrictEqual(properties.X509AuthUsers[1]);
  });

  test('log when cannot create x509 auth user', async () => {
    // GIVEN
    async function returnFalse(_v1: any, _v2: any): Promise<boolean> {
      return false;
    }
    const mockCreateAuthUser = jest.fn( (a, b) => returnFalse(a, b) );
    // tslint:disable-next-line: no-string-literal
    mockedHandler['createX509AuthUser'] = mockCreateAuthUser;
    const properties = {
      Connection: {
        Hostname: 'testhost',
        Port: '27017',
        Credentials: 'credentialArn',
        CaCertificate: 'certArn',
      },
      X509AuthUsers: [
        {
          Certificate: 'some arn',
          Roles: 'json encoded role',
        },
      ],
    };

    // WHEN
    await mockedHandler.doCreate('physicalId', properties);

    // THEN
    expect(consoleLogMock.mock.calls.length).toBe(2);
    expect(consoleLogMock.mock.calls[0][0]).toMatch(/No action performed for this user./);
  });
});
