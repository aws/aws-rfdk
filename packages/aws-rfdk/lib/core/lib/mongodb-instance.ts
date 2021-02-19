/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  BlockDeviceVolume,
} from '@aws-cdk/aws-autoscaling';
import {
  AmazonLinuxGeneration,
  Connections,
  IConnectable,
  InstanceType,
  ISecurityGroup,
  IVolume,
  IVpc,
  MachineImage,
  SubnetSelection,
  UserData,
  Volume,
} from '@aws-cdk/aws-ec2';
import {
  IGrantable,
  IPrincipal,
  IRole,
} from '@aws-cdk/aws-iam';
import {
  IKey,
} from '@aws-cdk/aws-kms';
import {
  ARecord,
  IPrivateHostedZone,
  RecordTarget,
} from '@aws-cdk/aws-route53';
import {
  Asset,
} from '@aws-cdk/aws-s3-assets';
import {
  ISecret,
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  Duration,
  IConstruct,
  Size,
} from '@aws-cdk/core';

import {
  BlockVolumeFormat,
  CloudWatchAgent,
  CloudWatchConfigBuilder,
  IScriptHost,
  IX509CertificatePem,
  LogGroupFactory,
  LogGroupFactoryProps,
  MongoDbInstaller,
  MongoDbSsplLicenseAcceptance,
  MongoDbVersion,
  MountableBlockVolume,
  StaticPrivateIpServer,
} from './';
import {
  tagConstruct,
} from './runtime-info';

/**
 * Specification for a when a new volume is being created by a MongoDbInstance.
 */
export interface MongoDbInstanceNewVolumeProps {
  /**
   * The size, in Gigabytes, of a new encrypted volume to be created to hold the MongoDB database
   * data for this instance. A new volume is created only if a value for the volume property
   * is not provided.
   *
   * @default 20 GiB
   */
  readonly size?: Size;

  /**
   * If creating a new EBS Volume, then this property provides a KMS key to use to encrypt
   * the Volume's data. If you do not provide a value for this property, then your default
   * service-owned KMS key will be used to encrypt the new Volume.
   *
   * @default Your service-owned KMS key is used to encrypt a new volume.
   */
  readonly encryptionKey?: IKey;
}

/**
 * Specification of the Amazon Elastic Block Storage (EBS) Volume that will be used by
 * a {@link MongoDbInstance} to store the MongoDB database's data.
 *
 * You must provide either an existing EBS Volume to mount to the instance, or the
 * {@link MongoDbInstance} will create a new EBS Volume of the given size that is
 * encrypted. The encryption will be with the given KMS key, if one is provided.
 */
export interface MongoDbInstanceVolumeProps {
  /**
   * An existing EBS volume. This volume is mounted to the {@link MongoDbInstace} using
   * the scripting in {@link MountableEbs}, and is subject to the restrictions outlined
   * in that class.
   *
   * The Volume must not be partitioned. The volume will be mounted to /var/lib/mongo on this instance,
   * and all files on it will be changed to be owned by the mongod user on the instance.
   *
   * This volume will contain all of the data that you store in MongoDB, so we recommend that you
   * encrypt this volume.
   *
   * @default A new encrypted volume is created for use by the instance.
   */
  readonly volume?: IVolume;

  /**
   * Properties for a new volume that will be constructed for use by this instance.
   *
   * @default A service-key encrypted 20Gb volume will be created.
   */
  readonly volumeProps?: MongoDbInstanceNewVolumeProps;
}

/**
 * Settings for the MongoDB application that will be running on a {@link MongoDbInstance}.
 */
export interface MongoDbApplicationProps {
  /**
   * MongoDB Community edition is licensed under the terms of the SSPL (see: https://www.mongodb.com/licensing/server-side-public-license ).
   * Users of MongoDbInstance must explicitly signify their acceptance of the terms of the SSPL through this
   * property before the {@link MongoDbInstance} will be allowed to install MongoDB.
   *
   * @default MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL
   */
  readonly userSsplAcceptance?: MongoDbSsplLicenseAcceptance;

  /**
   * What version of MongoDB to install on the instance.
   */
  readonly version: MongoDbVersion;

  /**
   * Private DNS zone to register the MongoDB hostname within. An A Record will automatically be created
   * within this DNS zone for the provided hostname to allow connection to MongoDB's static private IP.
   */
  readonly dnsZone: IPrivateHostedZone;

  /**
   * The hostname to register the MongoDB's listening interface as. The hostname must be
   * from 1 to 63 characters long and may contain only the letters from a-z, digits from 0-9,
   * and the hyphen character.
   *
   * The fully qualified domain name (FQDN) of this host will be this hostname dot the zoneName
   * of the given dnsZone.
   */
  readonly hostname: string;

  /**
   * A certificate that provides proof of identity for the MongoDB application. The DomainName, or
   * CommonName, of the provided certificate must exactly match the fully qualified host name
   * of this host. This certificate must not be self-signed; that is the given certificate must have
   * a defined certChain property.
   *
   * This certificate will be used to secure encrypted network connections to the MongoDB application
   * with the clients that connect to it.
   */
  readonly serverCertificate: IX509CertificatePem;

  /**
   * A secret containing credentials for the admin user of the database. The contents of this
   * secret must be a JSON document with the keys "username" and "password". ex:
   *     {
   *         "username": <admin user name>,
   *         "password": <admin user password>,
   *     }
   * If this user already exists in the database, then its credentials will not be modified in any way
   * to match the credentials in this secret. Doing so automatically would be a security risk.
   *
   * If created, then the admin user will have the database role:
   * [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
   *
   * @default Credentials will be randomly generated for the admin user.
   */
  readonly adminUser?: ISecret;

  /**
   * Specification of the Amazon Elastic Block Storage (EBS) Volume that will be used by
   * the instance to store the MongoDB database's data.
   *
   * The Volume must not be partitioned. The volume will be mounted to /var/lib/mongo on this instance,
   * and all files on it will be changed to be owned by the mongod user on the instance.
   *
   * @default A new 20 GiB encrypted EBS volume is created to store the MongoDB database data.
   */
  readonly mongoDataVolume?: MongoDbInstanceVolumeProps;
}

/**
 * Properties for a newly created {@link MongoDbInstance}.
 */
export interface MongoDbInstanceProps {
  /**
   * Properties for the MongoDB application that will be running on the instance.
   */
  readonly mongoDb: MongoDbApplicationProps;

  /**
   * The VPC in which to create the MongoDbInstance.
   */
  readonly vpc: IVpc;

  /**
   * Where to place the instance within the VPC.
   *
   * @default The instance is placed within a Private subnet.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * The type of instance to launch. Note that this must be an x86-64 instance type.
   *
   * @default r5.large
   */
  readonly instanceType?: InstanceType;

  /**
   * Name of the EC2 SSH keypair to grant access to the instance.
   *
   * @default No SSH access will be possible.
   */
  readonly keyName?: string;

  /**
   * Properties for setting up the MongoDB Instance's LogGroup in CloudWatch
   *
   * @default - LogGroup will be created with all properties' default values to the LogGroup: /renderfarm/<construct id>
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * An IAM role to associate with the instance profile that is assigned to this instance.
   * The role must be assumable by the service principal `ec2.amazonaws.com`
   *
   * @default A role will automatically be created, it can be accessed via the `role` property.
   */
  readonly role?: IRole;

  /**
   * The security group to assign to this instance.
   *
   * @default A new security group is created for this instance.
   */
  readonly securityGroup?: ISecurityGroup;
}

/**
 * Essential properties of a MongoDB database.
 */
export interface IMongoDb extends IConnectable, IConstruct {
  /**
   * Credentials for the admin user of the database. This user has database role:
   * [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
   */
  readonly adminUser: ISecret;

  /**
   * The certificate chain of trust for the MongoDB application's server certificate.
   * The contents of this secret is a single string containing the trust chain in PEM format, and
   * can be saved to a file that is then passed as the --sslCAFile option when connecting to MongoDB
   * using the mongo shell.
   */
  readonly certificateChain: ISecret;

  /**
   * The full host name that can be used to connect to the MongoDB application running on this
   * instance.
   */
  readonly fullHostname: string;

  /**
   * The port to connect to for MongoDB.
   */
  readonly port: number;

  /**
   * The version of MongoDB that is running on this instance.
   */
  readonly version: MongoDbVersion;

  /**
   * Adds security groups to the database.
   * @param securityGroups The security groups to add.
   */
  addSecurityGroup(...securityGroups: ISecurityGroup[]): void;
}

/**
 * This construct provides a {@link StaticPrivateIpServer} that is hosting MongoDB. The data for this MongoDB database
 * is stored in an Amazon Elastic Block Storage (EBS) Volume that is automatically attached to the instance when it is
 * launched, and is separate from the instance's root volume; it is recommended that you set up a backup schedule for
 * this volume.
 *
 * When this instance is first launched, or relaunched after an instance replacement, it will:
 * 1. Attach an EBS volume to /var/lib/mongo upon which the MongoDB data is stored;
 * 2. Automatically install the specified version of MongoDB, from the official Mongo Inc. sources;
 * 3. Create an admin user in that database if one has not yet been created -- the credentials for this user
 * can be provided by you, or randomly generated;
 * 4. Configure MongoDB to require authentication, and only allow encrypted connections over TLS.
 *
 * The instance's launch logs and MongoDB logs will be automatically stored in Amazon CloudWatch logs; the
 * default log group name is: /renderfarm/<this construct ID>
 *
 * Resources Deployed
 * ------------------------
 * - {@link StaticPrivateIpServer} that hosts MongoDB.
 * - An A-Record in the provided PrivateHostedZone to create a DNS entry for this server's static private IP.
 * - A Secret in AWS SecretsManager that contains the administrator credentials for MongoDB.
 * - An encrypted Amazon Elastic Block Store (EBS) Volume on which the MongoDB data is stored.
 * - Amazon CloudWatch log group that contains instance-launch and MongoDB application logs.
 *
 * Security Considerations
 * ------------------------
 * - The administrator credentials for MongoDB are stored in a Secret within AWS SecretsManager. You must strictly limit
 *   access to this secret to only entities that require it.
 * - The instances deployed by this construct download and run scripts from your CDK bootstrap bucket when that instance
 *   is launched. You must limit write access to your CDK bootstrap bucket to prevent an attacker from modifying the actions
 *   performed by these scripts. We strongly recommend that you either enable Amazon S3 server access logging on your CDK
 *   bootstrap bucket, or enable AWS CloudTrail on your account to assist in post-incident analysis of compromised production
 *   environments.
 * - The EBS Volume that is created by, or provided to, this construct is used to store the contents of your MongoDB data. To
 *   protect the sensitive data in your database, you should not grant access to this EBS Volume to any principal or instance
 *   other than the instance created by this construct. Furthermore, we recommend that you ensure that the volume that is
 *   used for this purpose is encrypted at rest.
 * - This construct uses this package's {@link StaticPrivateIpServer}, {@link MongoDbInstaller}, {@link CloudWatchAgent},
 *   {@link ExportingLogGroup}, and {@link MountableBlockVolume}. Security considerations that are outlined by the documentation
 *   for those constructs should also be taken into account.
 */
export class MongoDbInstance extends Construct implements IMongoDb, IGrantable {
  // How often Cloudwatch logs will be flushed.
  private static CLOUDWATCH_LOG_FLUSH_INTERVAL: Duration = Duration.seconds(15);
  // Default prefix for a LogGroup if one isn't provided in the props.
  private static DEFAULT_LOG_GROUP_PREFIX: string = '/renderfarm/';
  // Size of the EBS volume for MongoDB data, if we create one.
  private static DEFAULT_MONGO_DEVICE_SIZE = Size.gibibytes(20);
  // Mount point for the MongoDB data volume.
  private static MONGO_DEVICE_MOUNT_POINT = '/var/lib/mongo';
  // Size of the root device volume on the instance.
  private static ROOT_DEVICE_SIZE = Size.gibibytes(10);

  /**
   * Credentials for the admin user of the database. This user has database role:
   * [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ]
   */
  public readonly adminUser: ISecret;

  /**
   * @inheritdoc
   */
  public readonly certificateChain: ISecret;

  /**
   * Allows for providing security group connections to/from this instance.
   */
  public readonly connections: Connections;

  /**
   * The principal to grant permission to. Granting permissions to this principal will grant
   * those permissions to the instance role.
   */
  public readonly grantPrincipal: IPrincipal;

  /**
   * @inheritdoc
   */
  public readonly fullHostname: string;

  /**
   * The server that this construct creates to host MongoDB.
   */
  public readonly server: StaticPrivateIpServer;

  /**
   * The EBS Volume on which we are storing the MongoDB database data.
   */
  public readonly mongoDataVolume: IVolume;

  /**
   * The port to connect to for MongoDB.
   */
  public readonly port: number;

  /**
   * The IAM role that is assumed by the instance.
   */
  public readonly role: IRole;

  /**
   * The UserData for this instance.
   * UserData is a script that is run automatically by the instance the very first time that a new instance is started.
   */
  public readonly userData: UserData;

  /**
   * The version of MongoDB that is running on this instance.
   */
  public readonly version: MongoDbVersion;

  constructor(scope: Construct, id: string, props: MongoDbInstanceProps) {
    super(scope, id);

    this.version = props.mongoDb.version;

    // Select the subnet for this instance.
    const { subnets } = props.vpc.selectSubnets(props.vpcSubnets);
    if (subnets.length === 0) {
      throw new Error(`Did not find any subnets matching ${JSON.stringify(props.vpcSubnets)}. Please use a different selection.`);
    }
    const subnet = subnets[0];

    this.server = new StaticPrivateIpServer(this, 'Server', {
      vpc: props.vpc,
      vpcSubnets: { subnets: [ subnet ] },
      instanceType: props.instanceType ?? new InstanceType('r5.large'),
      machineImage: MachineImage.latestAmazonLinux({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      blockDevices: [
        {
          deviceName: '/dev/xvda', // Root volume
          volume: BlockDeviceVolume.ebs(MongoDbInstance.ROOT_DEVICE_SIZE.toGibibytes(), { encrypted: true }),
        },
      ],
      keyName: props.keyName,
      resourceSignalTimeout: Duration.minutes(5),
      role: props.role,
      securityGroup: props.securityGroup,
    });

    new ARecord(this, 'ARecord', {
      target: RecordTarget.fromIpAddresses(this.server.privateIpAddress),
      zone: props.mongoDb.dnsZone,
      recordName: props.mongoDb.hostname,
    });

    this.adminUser = props.mongoDb.adminUser ?? new Secret(this, 'AdminUser', {
      description: `Admin credentials for the MongoDB database ${this.node.uniqueId}`,
      generateSecretString: {
        excludeCharacters: '"()$\'', // Exclude characters that might interact with command shells.
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 24,
        requireEachIncludedType: true,
        generateStringKey: 'password',
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
      },
    });

    this.mongoDataVolume = props.mongoDb.mongoDataVolume?.volume ?? new Volume(this, 'MongoDbData', {
      size: MongoDbInstance.DEFAULT_MONGO_DEVICE_SIZE, // First so it can be overriden by the next entry
      ...props.mongoDb.mongoDataVolume?.volumeProps,
      availabilityZone: subnet.availabilityZone,
      encrypted: true,
    });
    const volumeMount = new MountableBlockVolume(this, {
      blockVolume: this.mongoDataVolume,
      volumeFormat: BlockVolumeFormat.XFS,
    });

    const mongoInstaller = new MongoDbInstaller(this, {
      version: props.mongoDb.version,
      userSsplAcceptance: props.mongoDb.userSsplAcceptance,
    });

    // Set up the server's UserData.
    this.server.userData.addCommands('set -xefuo pipefail');
    this.server.userData.addSignalOnExitCommand(this.server.autoscalingGroup);
    this.configureCloudWatchLogStreams(this.server, id, props.logGroupProps); // MUST BE FIRST
    volumeMount.mountToLinuxInstance(this.server, {
      location: MongoDbInstance.MONGO_DEVICE_MOUNT_POINT,
    });
    mongoInstaller.installOnLinuxInstance(this.server);
    this.configureMongoDb(this.server, props.mongoDb);

    this.certificateChain = props.mongoDb.serverCertificate.certChain!;
    this.connections = this.server.connections;
    this.grantPrincipal = this.server.grantPrincipal;
    this.port = 27017;
    this.role = this.server.role;
    this.userData = this.server.userData;
    this.fullHostname = `${props.mongoDb.hostname}.${props.mongoDb.dnsZone.zoneName}`;

    this.node.defaultChild = this.server;

    // Tag deployed resources with RFDK meta-data
    tagConstruct(this);
  }

  /**
   * @inheritdoc
   */
  public addSecurityGroup(...securityGroups: ISecurityGroup[]): void {
    securityGroups?.forEach(securityGroup => this.server.autoscalingGroup.addSecurityGroup(securityGroup));
  }

  /**
   * Adds UserData commands to install & configure the CloudWatch Agent onto the instance.
   *
   * The commands configure the agent to stream the following logs to a new CloudWatch log group:
   *     - The cloud-init log
   *     - The MongoDB application log.
   *
   * @param host The instance/host to setup the CloudWatchAgent upon.
   * @param groupName Name to append to the log group prefix when forming the log group name.
   * @param logGroupProps Properties for the log group
   */
  protected configureCloudWatchLogStreams(host: IScriptHost, groupName: string, logGroupProps?: LogGroupFactoryProps) {
    const prefix = logGroupProps?.logGroupPrefix ?? MongoDbInstance.DEFAULT_LOG_GROUP_PREFIX;
    const defaultedLogGroupProps = {
      ...logGroupProps,
      logGroupPrefix: prefix,
    };
    const logGroup = LogGroupFactory.createOrFetch(this, 'MongoDbInstanceLogGroupWrapper', groupName, defaultedLogGroupProps);

    logGroup.grantWrite(host.grantPrincipal);

    const cloudWatchConfigurationBuilder = new CloudWatchConfigBuilder(MongoDbInstance.CLOUDWATCH_LOG_FLUSH_INTERVAL);

    cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
      'cloud-init-output',
      '/var/log/cloud-init-output.log');
    cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
      'MongoDB',
      '/var/log/mongodb/mongod.log');

    new CloudWatchAgent(this, 'MongoDbInstanceLogsConfig', {
      cloudWatchConfig: cloudWatchConfigurationBuilder.generateCloudWatchConfiguration(),
      host,
    });
  }

  /**
   * Adds commands to the userData of the instance to install MongoDB, create an admin user if one does not exist, and
   * to to start mongod running.
   */
  protected configureMongoDb(instance: StaticPrivateIpServer, settings: MongoDbApplicationProps) {
    const scriptsAsset = new Asset(this, 'MongoSetup', {
      path: path.join(__dirname, '..', 'scripts', 'mongodb', settings.version),
    });
    scriptsAsset.grantRead(instance.grantPrincipal);

    const scriptZipfile = instance.userData.addS3DownloadCommand({
      bucket: scriptsAsset.bucket,
      bucketKey: scriptsAsset.s3ObjectKey,
    });

    instance.userData.addCommands(
      // Ensure mongod is installed and stopped before we go any further
      'which mongod && test -f /etc/mongod.conf',
      'sudo service mongod stop',
      // We're going to make a temporary RAM filesystem for the mongo setup files.
      // This will let us write sensitive data to "disk" without worrying about it
      // being persisted in any physical disk, even temporarily.
      'MONGO_SETUP_DIR=$(mktemp -d)',
      'mkdir -p "${MONGO_SETUP_DIR}"',
      'sudo mount -t tmpfs -o size=50M tmpfs "${MONGO_SETUP_DIR}"',
      'pushd "${MONGO_SETUP_DIR}"',
      `unzip ${scriptZipfile}`,
      // Backup mongod.conf for now
      'cp /etc/mongod.conf .',
    );

    const cert = settings.serverCertificate;
    instance.userData.addCommands(
      `bash serverCertFromSecrets.sh "${cert.cert.secretArn}" "${cert.certChain!.secretArn}" "${cert.key.secretArn}" "${cert.passphrase.secretArn}"`,
    );
    cert.cert.grantRead(instance.grantPrincipal);
    cert.certChain!.grantRead(instance.grantPrincipal);
    cert.key.grantRead(instance.grantPrincipal);
    cert.passphrase.grantRead(instance.grantPrincipal);

    const certsDirectory = '/etc/mongod_certs';
    instance.userData.addCommands(
      // Move the certificates into place
      `sudo mkdir -p ${certsDirectory}`,
      `sudo mv ./ca.crt ./key.pem ${certsDirectory}`,
      'sudo chown root.mongod -R /etc/mongod_certs/', // Something weird about shell interpretation. Can't use '*' on this or next line.
      'sudo chmod 640 -R /etc/mongod_certs/',
      'sudo chmod 750 /etc/mongod_certs/', // Directory needs to be executable.
      // mongod user id might, potentially change on reboot. Make sure we own all mongo data
      `sudo chown mongod.mongod -R ${MongoDbInstance.MONGO_DEVICE_MOUNT_POINT}`,
      // Configure mongod
      'bash ./setMongoLimits.sh',
      `bash ./setStoragePath.sh "${MongoDbInstance.MONGO_DEVICE_MOUNT_POINT}"`,
      'bash ./setMongoNoAuth.sh',
      'sudo service mongod start',
      `bash ./setAdminCredentials.sh "${this.adminUser.secretArn}"`,
    );
    this.adminUser.grantRead(instance.grantPrincipal);

    instance.userData.addCommands(
      // Setup for live deployment, and start mongod
      'sudo service mongod stop',
      'bash ./setLiveConfiguration.sh',
      'sudo systemctl enable mongod', // Enable restart on reboot
      'sudo service mongod start',
      'popd',
    );

    instance.userData.addOnExitCommands(
      // Clean up the temporary RAM filesystem
      'test "${MONGO_SETUP_DIR} != "" && sudo umount "${MONGO_SETUP_DIR}',
    );
  }

}
