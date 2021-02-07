/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { exec as execAsync, execSync } from 'child_process';
import { promisify } from 'util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from 'aws-sdk';
import { LambdaContext } from '../lib/aws-lambda';
import { CfnRequestEvent, SimpleCustomResource } from '../lib/custom-resource';

import {
  writeAsciiFile,
} from '../lib/filesystem';
import {
  readCertificateData,
  Secret,
} from '../lib/secrets-manager';
import {
  IConnectionOptions,
  IMongoDbConfigureResource,
  implementsIMongoDbConfigureResource,
  IX509AuthenticatedUser,
} from './types';

const exec = promisify(execAsync);

export class MongoDbConfigure extends SimpleCustomResource {
  protected readonly secretsManagerClient: SecretsManager;

  constructor(secretsManagerClient: SecretsManager) {
    super();
    this.secretsManagerClient = secretsManagerClient;
  }
  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public validateInput(data: object): boolean {
    return implementsIMongoDbConfigureResource(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: IMongoDbConfigureResource): Promise<object|undefined> {
    const mongoDbDriver = this.installMongoDbDriver();
    const mongoClient = await this.mongoLogin(mongoDbDriver, resourceProperties.Connection);
    try {
      if (resourceProperties.PasswordAuthUsers) {
        const adminDb = mongoClient.db('admin');
        for (const userArn of resourceProperties.PasswordAuthUsers) {
          if (!await this.createPasswordAuthUser(adminDb, userArn)) {
            // Note: Intentionally not including the data as part of this message. It may contain secrets, and including it will leak those secrets.
            console.log(`User in '${userArn}' already exists in the MongoDB. No action performed for this user.`);
          }
        }
      }
      if (resourceProperties.X509AuthUsers) {
        const externalDb = mongoClient.db('$external');
        for (const x509User of resourceProperties.X509AuthUsers) {
          if (!await this.createX509AuthUser(externalDb, x509User)) {
            // Note: Intentionally not including the data as part of this message. It may contain secrets, and including it will leak those secrets.
            console.log(`User in '${x509User.Certificate}' already exists in the MongoDB. No action performed for this user.`);
          }
        }
      }
    } finally {
      console.log('Closing Mongo connection');
      await mongoClient.close();
    }
    return undefined;
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: IMongoDbConfigureResource): Promise<void> {
    // Nothing to do -- we don't modify any existing DB contents.
    return;
  }

  /**
   * Installs the official NodeJS MongoDB driver into /tmp, and returns the module object for it.
   */
  /* istanbul ignore next */
  protected installMongoDbDriver(): any {
    console.log('Installing latest MongoDB Driver for NodeJS from npmjs.org');
    // Both HOME and --prefix are needed here because /tmp is the only writable location
    execSync('HOME=/tmp npm install mongodb@3 --production --no-package-lock --no-save --prefix /tmp');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('/tmp/node_modules/mongodb');
  }

  /**
   * Login to MongoDB and return the MongoClient connection object.
   * @param mongoDbDriver
   * @param options
   */
  protected async mongoLogin(mongoDbDriver: any, options: IConnectionOptions): Promise<any> {
    // Get the CA cert.
    const caData = await this.readCertificateData(options.CaCertificate);
    await writeAsciiFile('/tmp/ca.crt', caData);

    // Next, the login credentials
    const credentials = await this.readLoginCredentials(options.Credentials);

    // Login to MongoDB
    const mongoUri = `mongodb://${options.Hostname}:${options.Port}`;
    console.log(`Connecting to: ${mongoUri}`);
    // Reference: http://mongodb.github.io/node-mongodb-native/3.5/api/MongoClient.html#.connect
    return await mongoDbDriver.MongoClient.connect(mongoUri, {
      tls: true, // Require TLS
      tlsInsecure: false, // Require server identity validation
      tlsCAFile: '/tmp/ca.crt',
      auth: {
        user: credentials.username,
        password: credentials.password,
      },
      useUnifiedTopology: true, // We error on connect if not passing this.
    });
  }

  /**
   * Retrieve CA certificate data from the Secret with the given ARN.
   * @param certificateArn
   */
  protected async readCertificateData(certificateArn: string): Promise<string> {
    return await readCertificateData(certificateArn, this.secretsManagerClient);
  }

  /**
   * Use openssl to retrieve the subject, in RFC2253 format, of the given certificate.
   * @param certificateData
   */
  protected async retrieveRfc2253Subject(certificateData: string): Promise<string> {
    await writeAsciiFile('/tmp/client.crt', certificateData);
    const subject = await exec('openssl x509 -in /tmp/client.crt -noout -subject -nameopt RFC2253');
    return subject.stdout.replace(/subject= /, '').trim();
  }

  /**
   * Retrieve the credentials of the user that we're to login to the DB with.
   * @param credentialsArn
   */
  protected async readLoginCredentials(credentialsArn: string): Promise<{ [key: string]: string}> {
    const data = await Secret.fromArn(credentialsArn, this.secretsManagerClient).getValue();
    if (Buffer.isBuffer(data) || !data) {
      throw new Error(`Login credentials, in Secret ${credentialsArn}, for MongoDB must be a JSON encoded string`);
    }
    let credentials: { [key: string]: string };
    try {
      credentials = JSON.parse(data);
    } catch (e) {
      // Note: Intentionally not including the data as part of this error message. It may contain secrets, and including it will leak those secrets.
      throw new Error(`Failed to parse JSON in MongoDB login credentials Secret (${credentialsArn}). Please ensure that the Secret contains properly formatted JSON.`);
    }
    for (const key of ['username', 'password']) {
      if (!(key in credentials)) {
        throw new Error(`Login credentials Secret (${credentialsArn}) is missing: ${key}`);
      }
    }
    return credentials;
  }

  /**
   * Read, from the given Secret, the information for a password-authenticated user to be created
   * in the DB.
   * @param userArn
   */
  protected async readPasswordAuthUserInfo(userArn: string): Promise<{[key: string]: string}> {
    const data = await Secret.fromArn(userArn, this.secretsManagerClient).getValue();
    if (Buffer.isBuffer(data) || !data) {
      throw new Error(`Password-auth user credentials, in Secret ${userArn}, for MongoDB must be a JSON encoded string`);
    }
    let userCreds: { [key: string]: string };
    try {
      userCreds = JSON.parse(data);
    } catch (e) {
      // Note: Intentionally not including the data as part of this error message. It may contain secrets, and including it will leak those secrets.
      throw new Error(`Failed to parse JSON for password-auth user Secret (${userArn}). Please ensure that the Secret contains properly formatted JSON.`);
    }
    for (const key of ['username', 'password', 'roles']) {
      if (!(key in userCreds)) {
        // Note: Intentionally not including the data as part of this error message. It may contain secrets, and including it will leak those secrets.
        throw new Error(`User credentials Secret '${userArn}' is missing: ${key}`);
      }
    }
    return userCreds;
  }

  /**
   * Query the given DB to determine whether or not there is a user with the given username.
   * @param db
   * @param username
   */
  protected async userExists(db: any, username: string): Promise<boolean> {
    const result = await db.command({ usersInfo: username });
    if (result.ok !== 1) {
      throw new Error(`MongoDB error checking whether user exists \'${username}\' -- ${JSON.stringify(result)}`);
    }
    return result.users.length > 0;
  }

  /**
   * Add a user to the database. This must only be called if you know that the user does not
   * already exist.
   * @param db
   * @param credentials
   */
  protected async createUser(db: any, credentials: { [key: string]: any }): Promise<void> {
    console.log(`Creating user: ${credentials.username}`);
    const request: { [key: string]: any } = {
      createUser: credentials.username,
      roles: credentials.roles,
    };
    // It is an error to include a pwd field with undefined value, and our password
    // will be absent/undefined for x.509 authenticated users in the $external DB.
    if (credentials.password) {
      request.pwd = credentials.password;
    }
    const result = await db.command(request);
    if (result.ok !== 1) {
      throw new Error(`MongoDB error when adding user \'${credentials.username}\' -- ${JSON.stringify(result)}`);
    }
  }
  /**
   * Create a user in the admin DB if it does not already exist. If it does exist, then do nothing.
   * @param db
   * @param userArn
   */
  protected async createPasswordAuthUser(db: any, userArn: string): Promise<boolean> {
    const credentials = await this.readPasswordAuthUserInfo(userArn);
    if (await this.userExists(db, credentials.username)) {
      return false;
    }
    await this.createUser(db, credentials);
    return true;
  }

  /**
   * Create a user in the $external DB if it does not already exist. If it does exist, then do nothing.
   * @param db
   * @param user
   */
  protected async createX509AuthUser(db: any, user: IX509AuthenticatedUser): Promise<boolean> {
    const userCertData = await this.readCertificateData(user.Certificate);
    const username = await this.retrieveRfc2253Subject(userCertData);
    if (await this.userExists(db, username)) {
      return false;
    }
    const credentials: { [key: string]: any } = {
      username,
      // Note: No need to check for parse-errors. It's already been vetted twice. Once by the typescript code, and once by the
      // input verifier of this handler.
      roles: JSON.parse(user.Roles),
    };
    await this.createUser(db, credentials);
    return true;
  }
}

/**
 * The lambda handler that is used to log in to MongoDB and perform some configuration actions.
 */
/* istanbul ignore next */
export async function configureMongo(event: CfnRequestEvent, context: LambdaContext): Promise<string> {
  const handler = new MongoDbConfigure(new SecretsManager());
  return await handler.handler(event, context);
}
