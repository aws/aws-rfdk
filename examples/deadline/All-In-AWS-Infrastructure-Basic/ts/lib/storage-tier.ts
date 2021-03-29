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
import {
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from '@aws-cdk/aws-cloudwatch';
import {
  SnsAction,
} from '@aws-cdk/aws-cloudwatch-actions';
import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import {
  AccessPoint,
  FileSystem,
} from '@aws-cdk/aws-efs';
import {
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  Key,
} from '@aws-cdk/aws-kms';
import { IPrivateHostedZone } from '@aws-cdk/aws-route53';
import {
  Topic,
} from '@aws-cdk/aws-sns';
import {
  EmailSubscription,
} from '@aws-cdk/aws-sns-subscriptions';
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

  /**
   * Email address to send alerts to when CloudWatch Alarms breach.
   */
  readonly alarmEmail: string;
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
      // We have enableLocalFilecaching set to 'true' on the RenderQueue in the
      // Service Tier. EFS requires the 'fsc' mount option to take advantage of
      // that.
      extraMountOptions: [ 'fsc' ]
    });

    // The Amazon EFS filesystem deployed above has been deployed in bursting throughput
    // mode. This means that it can burst throughput up to 100 MiB/s (with reads counting as
    // 1/3 of their actual throughput for this purpose). However, the baseline throughput of the EFS
    // is 50 KiB/s per 1 GiB stored in the filesystem and exceeding this throughput consumes burst credits;
    // the EFS regains burst credits when throughput is below the baseline throughput threshold.
    //
    // The Deadline Repository is approximately 1 GiB in size; resulting in 50 KiB/s baseline throughput, which is
    // not sufficient for the operation of Deadline.
    //
    // The following:
    // 1) Sets up a series of AWS CloudWatch Alarms that will send you an email to alert you to take action
    // to increase the data stored in the filesystem when the burst credits have decreased below certain thresholds.
    // If you run out of burst credits on the filesystem, then Deadline will start timing-out on requests and your
    // render farm may become unstable.
    // 2) Uses RFDK's PadEfsStorage construct to add data to the EFS for the purpose of increasing the amount
    // of stored data to increase the baseline throughput.
    // 
    // See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
    // for more information on AWS CloudWatch Alarms.
    // See: https://docs.aws.amazon.com/efs/latest/ug/performance.html#throughput-modes
    // for more information on Amazon EFS throughput modes.

    if (props.alarmEmail) {
      this.addLowEfsBurstCreditAlarms(fileSystem, props.alarmEmail);
    }

    // Add padding files to the filesystem to increase baseline throughput. We add files to the filesystem to
    // increase this baseline throughput, while retaining the ability to burst throughput. See RFDK's PadEfsStorage
    // documentation for additional details.
    const padAccessPoint = new AccessPoint(this, 'PaddingAccessPoint', {
      fileSystem,
      path: '/RFDK_PaddingFiles',
      // TODO - We set the padding files to be owned by root (uid/gid = 0) by default. You may wish to change this.
      createAcl: {
        ownerGid: '0',
        ownerUid: '0',
        permissions: '700',
      },
      posixUser: {
        uid: '0',
        gid: '0',
      },
    });
    new PadEfsStorage(this, 'PadEfsStorage', {
      vpc: props.vpc,
      accessPoint: padAccessPoint,
      desiredPadding: cdk.Size.gibibytes(40), // Provides 2 MiB/s of baseline throughput. Costs $12/month.
    });

  }

  /**
   * Set up CloudWatch Alarms that will warn when the given filesystem's burst credits are below
   * four different thresholds. We send an email to the given address when an Alarm breaches.
   */
  protected addLowEfsBurstCreditAlarms(filesystem: FileSystem, emailAddress: string): void {
    // Set up the SNS Topic that will send the emails.
    // ====================
    // 1) KMS key to use to encrypt events within the SNS Topic. The Key is optional
    const key = new Key(this, 'SNSEncryptionKey', {
      description: 'Used to encrypt the SNS Topic for sending EFS Burst Credit alerts',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
      trustAccountIdentities: true,
    });
    key.grant(new ServicePrincipal('cloudwatch.amazonaws.com'), 'kms:Decrypt', 'kms:GenerateDataKey');

    // 2) SNS Topic that will be alerted by CloudWatch and will send the email in response.
    const snsTopic = new Topic(this, 'BurstAlertEmailTopic', {
      masterKey: key,
    });
    snsTopic.grantPublish(new ServicePrincipal('cloudwatch.amazonaws.com'));
    snsTopic.addSubscription(new EmailSubscription(emailAddress));
    const alarmAction = new SnsAction(snsTopic);

    // Set up the CloudWatch Alarm(s) and have them trigger SNS events when breached.
    // ======================
    // 1) CDK helper to define the CloudWatch Metric that we're interested in.
    const burstCreditsMetric = new Metric({
      metricName: 'BurstCreditBalance',
      namespace: 'AWS/EFS',
      dimensions: {
        FileSystemId: filesystem.fileSystemId,
      },
      // One 99-th percentile data point every 6 hours
      period: Duration.hours(6),
      statistic: 'p99',
    });
    
    // 2) Create the alarms
    const thresholds = [
      {
        id: 'CAUTION-EfsBurstCredits',
        name: `CAUTION Burst Credits - ${filesystem.fileSystemId}`,
        threshold: 2.00 * 2**40,
        message: `CAUTION. 2 TiB Threshold Breached: EFS ${filesystem.fileSystemId} is depleting burst credits. Add data to the EFS to increase baseline throughput.`
      },
      {
        id: 'WARNING-EfsBurstCredits',
        name: `WARNING Burst Credits - ${filesystem.fileSystemId}`,
        threshold: 1.25 * 2**40,
        message: `WARNING. 1.25 TiB Threshold Breached: EFS ${filesystem.fileSystemId} is depleting burst credits. Add data to the EFS to increase baseline throughput.`
      },
      {
        id: 'ALERT-EfsBurstCredits',
        name: `ALERT Burst Credits - ${filesystem.fileSystemId}`,
        threshold: 0.50 * 2**40,
        message: `ALERT! 500 GiB Threshold Breached: EFS ${filesystem.fileSystemId} is running out of burst credits. Add data to the EFS to increase baseline throughput or else the Render Farm may cease operation.`
      },
      {
        id: 'EMERGENCY-EfsBurstCredits',
        name: `EMERGENCY Burst Credits - ${filesystem.fileSystemId}`,
        threshold: 0.10 * 2**40,
        message: `EMERGENCY! 100 GiB Threshold Breached: EFS ${filesystem.fileSystemId} is running out of burst credits. Add data to the EFS to increase baseline throughput or else the Render Farm will cease operation.`
      },
    ]
    for (var config of thresholds) {
      const alarm = burstCreditsMetric.createAlarm(this, config.id, {
        alarmName: config.name,
        actionsEnabled: true,
        alarmDescription: config.message,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        threshold: config.threshold,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        // We have 1 datapoint every 6 hours. CloudWatch can check a period of time
        // of at most 1 day. So, we alarm if we've gone a full day below the threshold.
        evaluationPeriods: 4,
      });
      alarm.addAlarmAction(alarmAction);
    }
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
