/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstanceType,
  IVpc,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import {
  AccessPoint,
  FileSystem,
} from '@aws-cdk/aws-efs';
import { IPrivateHostedZone } from '@aws-cdk/aws-route53';
import { RemovalPolicy, Duration } from '@aws-cdk/core';
import {
  MongoDbInstance,
  MongoDbPostInstallSetup,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  MountableEfs,
  PadEfsStorage,
  X509CertificatePem,
  X509CertificatePkcs12,
} from 'aws-rfdk';
import {
  DatabaseConnection,
} from 'aws-rfdk/deadline';


/**
 * Properties for {@link StorageTier}.
 */
export interface StorageTierProps extends cdk.StackProps {
  /**
   * The VPC to deploy resources into.
   */
  readonly vpc: IVpc;
}

/**
 * The storage tier of the render farm. This stack contains all constructs that persist
 * data which would be useful to keep between deployments. There should little to no "business-logic"
 * constructs in this stack.
 */
export abstract class StorageTier extends cdk.Stack {
  /**
   * The mountable file-system to use for the Deadline Repository
   */
  public readonly mountableFileSystem: MountableEfs;

  /**
   * The database to connect Deadline to.
   */
  public abstract readonly database: DatabaseConnection;

  /**
   * Initializes a new instance of {@link StorageTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for the storage tier.
   */
  constructor(scope: cdk.Construct, id: string, props: StorageTierProps) {
    super(scope, id, props);

    const fileSystem = new FileSystem(this, 'EfsFileSystem', {
      vpc: props.vpc,
      encrypted: true,
      // TODO - Evaluate this removal policy for your own needs. This is set to DESTROY to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that your data is not accidentally deleted, you should modify this value.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Add padding files to the filesystem to increase baseline throughput. Deadline's Repository filesystem
    // is small (initial size of about 1GB), which results in a very low baseline throughput for the Amazon
    // EFS filesystem. We add files to the filesystem to increase this baseline throughput, while retaining the
    // ability to burst throughput. See RFDK's PadEfsStorage documentation for additional details.
    const padAccessPoint = new AccessPoint(this, 'PaddingAccessPoint', {
      fileSystem,
      path: '/PaddingFiles',
      // TODO - We set the padding files to be owned by root (uid/gid = 0) by default. You may wish to change this.
      createAcl: {
        ownerGid: '0',
        ownerUid: '0',
        permissions: '744',
      },
      posixUser: {
        uid: '0',
        gid: '0',
      },
    });
    new PadEfsStorage(this, 'PadEfsStorage', {
      vpc: props.vpc,
      accessPoint: padAccessPoint,
      desiredPaddingGB: 40, // Provides 2 MB/s of baseline throughput. Costs $12/month.
    });

    // Create an EFS access point that is used to grant the Repository and RenderQueue with write access to the Deadline
    // Repository directory in the EFS file-system.
    const accessPoint = new AccessPoint(this, 'AccessPoint', {
      fileSystem,

      // The AccessPoint will create the directory (denoted by the "path" property below) if it doesn't exist with the
      // owning UID/GID set as specified here. These should be set up to grant read and write access to the UID/GID
      // configured in the "poxisUser" property below.
      createAcl: {
        ownerGid: '10000',
        ownerUid: '10000',
        permissions: '750',
      },

      // When you mount the EFS via the access point, the mount will be rooted at this path in the EFS file-system
      path: '/DeadlineRepository',

      // TODO - When you mount the EFS via the access point, all file-system operations will be performed using these
      // UID/GID values instead of those from the user on the system where the EFS is mounted. If you intend to use the
      // same EFS file-system for other purposes (e.g. render assets, plug-in storage), you may want to evaluate the
      // UID/GID permissions based on your requirements.
      posixUser: {
        uid: '10000',
        gid: '10000',
      },
    });

    this.mountableFileSystem = new MountableEfs(this, {
      filesystem: fileSystem,
      accessPoint,
    });
  }
}

/**
 * Properties for {@link StorageTierDocDB}.
 */
export interface StorageTierDocDBProps extends StorageTierProps {
  /**
   * The {@link InstanceType} for DocDB.
   */
  readonly databaseInstanceType: InstanceType;
}

/**
 * An implementation of {@link StorageTier} that is backed by DocumentDB.
 */
export class StorageTierDocDB extends StorageTier {
  /**
   * The DocDB connection.
   */
  public readonly database: DatabaseConnection;

  /**
   * Initiailizes a new instance of {@link StorageTierDocDB}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for this construct.
   */
  constructor(scope: cdk.Construct, id: string, props: StorageTierDocDBProps) {
    super(scope, id, props);

    const docDb = new DatabaseCluster(this, 'DocDBCluster', {
      instanceProps: {
        vpc: props.vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE },
        instanceType: props.databaseInstanceType,
      },
      // TODO - For cost considerations this example only uses 1 Database instance. 
      // It is recommended that when creating your render farm you use at least 2 instances for redundancy.
      instances: 1,
      masterUser: {
        username: 'adminuser',
      },
      engineVersion: '3.6.0',
      backup: {
        // We recommend setting the retention of your backups to 15 days
        // for security reasons. The default retention is just one day.
        // Please note that changing this value will affect cost.
        retention: Duration.days(15),
      },
      // TODO - Evaluate this removal policy for your own needs. This is set to DESTROY to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that your data is not accidentally deleted, you should modify this value.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.database = DatabaseConnection.forDocDB({
      database: docDb,
      login: docDb.secret!,
    });
  }
}

/**
 * Properties for {@link StorageTierMongoDB}.
 */
export interface StorageTierMongoDBProps extends StorageTierProps {
  /**
   * The {@link InstanceType} for MongoDB.
   */
  readonly databaseInstanceType: InstanceType;

  /**
   * Self-signed root CA to sign server certificates with.
   */
  readonly rootCa: X509CertificatePem;

  /**
   * Internal DNS zone for the VPC.
   */
  readonly dnsZone: IPrivateHostedZone;

  /**
   * Whether the SSPL license is accepted or not.
   */
  readonly acceptSsplLicense: MongoDbSsplLicenseAcceptance;

  /**
   * The name of the EC2 keypair to associate with the MongoDB instance.
   */
  readonly keyPairName?: string;
}

/**
 * An implementation of {@link StorageTier} that is backed by MongoDB.
 */
export class StorageTierMongoDB extends StorageTier {
  /**
   * The MongoDB connection.
   */
  public readonly database: DatabaseConnection;


  /**
   * Initiailizes a new instance of {@link StorageTierMongoDB}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for this construct.
   */
  constructor(scope: cdk.Construct, id: string, props: StorageTierMongoDBProps) {
    super(scope, id, props);

    const serverCert = new X509CertificatePem(this, 'MongoCert', {
      subject: {
        cn: `mongo.${props.dnsZone.zoneName}`,
        o: 'RFDK-Sample',
        ou: 'MongoServer',
      },
      signingCertificate: props.rootCa,
    });
    const clientCert = new X509CertificatePem(this, 'DeadlineMongoCert', {
      subject: {
        cn: 'SampleUser',
        o: 'RFDK-Sample',
        ou: 'MongoClient',
      },
      signingCertificate: props.rootCa,
    });
    const clientPkcs12 = new X509CertificatePkcs12(this, 'DeadlineMongoPkcs12', {
      sourceCertificate: clientCert,
    });

    const availabilityZone = props.vpc.availabilityZones[0];

    const mongoDb = new MongoDbInstance(this, 'MongoDb', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE, availabilityZones: [ availabilityZone ] },
      keyName: props.keyPairName,
      instanceType: props.databaseInstanceType,
      mongoDb: {
        userSsplAcceptance: props.acceptSsplLicense,
        version: MongoDbVersion.COMMUNITY_3_6,
        hostname: 'mongo',
        dnsZone: props.dnsZone,
        serverCertificate: serverCert,
      },
    });

    new MongoDbPostInstallSetup(this, 'MongoDbPostInstall', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE, availabilityZones: [ availabilityZone ] },
      mongoDb,
      users: {
        x509AuthUsers: [
          {
            certificate: clientCert.cert,
            // Default roles set by Deadline when it creates an X.509 user in MongoDB.
            roles: JSON.stringify([ { role: 'readWriteAnyDatabase', db: 'admin' }, { role: 'clusterMonitor', db: 'admin' } ]),
          },
        ],
      },
    });

    this.database = DatabaseConnection.forMongoDbInstance({
      database: mongoDb,
      clientCertificate: clientPkcs12,
    });
  }
}
