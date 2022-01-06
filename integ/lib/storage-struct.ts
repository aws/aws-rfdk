/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  AccessPoint,
  FileSystem,
} from '@aws-cdk/aws-efs';
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  Duration,
  RemovalPolicy,
  Stack,
} from '@aws-cdk/core';
import {
  MongoDbInstance,
  MongoDbPostInstallSetup,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  MountableEfs,
  X509CertificatePem,
  X509CertificatePkcs12,
} from 'aws-rfdk';
import {
  DatabaseConnection,
  IVersion,
  Repository,
} from 'aws-rfdk/deadline';


// Interface for supplying database connection and accompanying secret for credentials
export interface IRenderFarmDb {
  db: DatabaseCluster | MongoDbInstance,
  secret: ISecret,
  cert?: X509CertificatePem,
}

export enum DatabaseType {
  DocDB = 1,
  MongoDB = 2,
}

export interface StorageStructProps {
  readonly integStackTag: string;
  readonly version: IVersion;
  readonly databaseType?: DatabaseType;
  /**
   * @default false
   */
  readonly enableSecretsManagement?: boolean;
}

export class StorageStruct extends Construct {
  public readonly repo: Repository;
  public readonly database: IRenderFarmDb;
  public readonly efs: FileSystem;

  constructor(scope: Construct, id: string, props: StorageStructProps) {
    super(scope, id);

    // Confirm that user has accepted SSPL license to use mongoDB
    const userAcceptsSSPL = process.env.USER_ACCEPTS_SSPL_FOR_RFDK_TESTS!.toString();
    const userSsplAcceptance =
      userAcceptsSSPL === 'true' ? MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL : MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;

    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;

    // Get farm VPC from lookup
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    // Create EFS filesystem here since both MongoDB and DocDB will be backed by an EFS filesystem.
    const deadlineEfs = new FileSystem(this, 'FileSystem', {
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
        // We must limit the subnets to one per AZ to avoid creating duplicate EFS mount targets for the same AZ,
        // causing the stack deployment to fail.
        onePerAz: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const accessPoint = new AccessPoint(this, 'AccessPoint', {
      fileSystem: deadlineEfs,
      posixUser: {
        uid: '0',
        gid: '0',
      },
    });
    const deadlineMountableEfs = new MountableEfs(this, {
      filesystem: deadlineEfs,
      accessPoint,
    });

    let cacert;
    let database;
    let databaseConnection;
    let databaseSecret: ISecret;

    // Check if the test requires a DocDB or MongoDB to be created. If neither is provided, the Repository construct will create a DocDB itself.
    if (props.databaseType == DatabaseType.DocDB) {

      // Create a DocDB database cluster on the VPC
      database = new DatabaseCluster(this, 'DocumentDatabase', {
        instanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
        vpc,
        vpcSubnets: {
          onePerAz: true,
          subnetType: SubnetType.PRIVATE,
        },
        masterUser: {
          username: 'DocDBUser',
        },
        engineVersion: '3.6.0',
        backup: {
          retention: Duration.days(15),
        },
        removalPolicy: RemovalPolicy.DESTROY,
      });
      databaseSecret = database.secret!;

      // Create a database connection for the DocDB
      databaseConnection = DatabaseConnection.forDocDB({
        database: database,
        login: databaseSecret,
      });
    }
    // If databaseType is MongoDB, a MongoDB instance is created in place of the DocDB
    else if (props.databaseType == DatabaseType.MongoDB) {

      // Create CA signing certificate
      cacert = new X509CertificatePem(this, 'CaCert', {
        subject: {
          cn: 'ca.renderfarm.local',
        },
      });

      // Create server-side certificate signed with the CA cert
      const serverCert = new X509CertificatePem(this, 'MongoCert', {
        subject: {
          cn: 'mongo.renderfarm.local',
          o: 'RFDK-Integ',
          ou: 'MongoServer',
        },
        signingCertificate: cacert,
      });

      // Create client-side certificate signed with the CA cert
      const clientCert = new X509CertificatePem(this, 'DeadlineMongoCert', {
        subject: {
          cn: 'MongoUser',
          o: 'RFDK-Integ',
          ou: 'MongoClient',
        },
        signingCertificate: cacert,
      });

      // Create PKCS12 certificate from the client certificate
      const clientPkcs12 = new X509CertificatePkcs12(this, 'DeadlineMongoPkcs12', {
        sourceCertificate: clientCert,
      });

      // Create the mongoDB instance
      database = new MongoDbInstance(this, 'MongoDB', {
        mongoDb: {
          userSsplAcceptance,
          version: MongoDbVersion.COMMUNITY_3_6,
          dnsZone: new PrivateHostedZone(this, 'Zone', {
            zoneName: 'renderfarm.local',
            vpc,
          }),
          hostname: 'mongo',
          serverCertificate: serverCert,
        },
        vpc,
      });
      databaseSecret = database.adminUser!;

      new MongoDbPostInstallSetup(this, 'MongoDbPostInstall', {
        vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE },
        mongoDb: database,
        users: {
          x509AuthUsers: [
            {
              certificate: clientCert.cert,
              roles: JSON.stringify([ { role: 'readWriteAnyDatabase', db: 'admin' }, {role: 'clusterMonitor', db: 'admin' }]),
            },
          ],
        },
      });

      databaseConnection = DatabaseConnection.forMongoDbInstance({
        database,
        clientCertificate: clientPkcs12,
      });
    }
    else {
      // Otherwise the repository installer will handle creating a DocDB
      database = undefined;
      databaseConnection = undefined;
    }

    // Define properties for Deadline installer. A unique log group name is created so that logstreams are not assigned
    // to the same log group across tests
    this.repo = new Repository(this, 'Repository', {
      vpc,
      database: databaseConnection,
      fileSystem: deadlineMountableEfs,
      version: props.version,
      repositoryInstallationTimeout: Duration.minutes(20),
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      removalPolicy: {
        database: RemovalPolicy.DESTROY,
        filesystem: RemovalPolicy.DESTROY,
      },
      secretsManagementSettings: {
        enabled: props.enableSecretsManagement ?? false,
        credentialsRemovalPolicy: RemovalPolicy.DESTROY,
      },
    });

    if( !database ) {
      database = this.repo.node.findChild('DocumentDatabase') as DatabaseCluster;
      databaseSecret = database.secret!;
    }
    this.database = {
      db: database,
      secret: databaseSecret!,
      cert: cacert,
    };
    this.efs = ( deadlineEfs || this.repo.node.findChild('FileSystem') as FileSystem );
  }
}
