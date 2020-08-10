/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  pathToFileURL,
} from 'url';

import {
  AutoScalingGroup,
  UpdateType,
} from '@aws-cdk/aws-autoscaling';
import {
  CfnDBInstance,
  DatabaseCluster,
} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  OperatingSystemType,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  MountPoint,
  TaskDefinition,
} from '@aws-cdk/aws-ecs';
import {
  FileSystem as EfsFileSystem,
  LifecyclePolicy as EfsLifecyclePolicy,
} from '@aws-cdk/aws-efs';
import {
  PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Construct,
  Duration,
  IConstruct,
  RemovalPolicy,
  Stack,
  Tag,
} from '@aws-cdk/core';
import {
  CloudWatchAgent,
  CloudWatchConfigBuilder,
  IMountableLinuxFilesystem,
  LogGroupFactory,
  LogGroupFactoryProps,
  MountableEfs,
  ScriptAsset,
} from '../../core';

import { DatabaseConnection } from './database-connection';
import { IHost } from './host-ref';
import { IVersion } from './version-ref';

/**
 * Configuration interface for specifying ECS container instances to permit connecting hosted ECS tasks to the repository
 */
export interface ECSContainerInstanceProps {
  /**
   * The set of hosts that will be hosting the containers.
   *
   * This can be AutoScalingGroups that make up the capacity of an Amazon ECS cluster, or individual instances.
   */
  readonly hosts: IHost[];

  /**
   * The path where the repository file-system is mounted on the container hosts.
   *
   * @default "/mnt/repo"
   */
  readonly filesystemMountPoint?: string;
}

/**
 * Configuration interface to directly connect an ECS task to the repository.
 */
export interface ECSTaskProps {
  /**
   * The task definition to connect to the repository.
   *
   * [disable-awslint:ref-via-interface]
   */
  readonly taskDefinition: TaskDefinition;

  /**
   * The path where the repository file-system is mounted within the container.
   *
   * @default "/opt/Thinkbox/DeadlineRepository{MAJOR_VER}"
   */
  readonly filesystemMountPoint?: string;
}

/**
 * The properties used to configure Deadline running in an Amazon EC2 ECS task to directly connect to the repository.
 */
export interface ECSDirectConnectProps {

  /**
   * Configuration of ECS host instances to permit connecting hosted ECS tasks to the repository
   */
  readonly containerInstances: ECSContainerInstanceProps;

  /**
   * Configuration to directly connect an ECS task to the repository.
   */
  readonly containers: ECSTaskProps;
}

/**
 * Interface that can be used to configure a {@link @aws-cdk/aws-ecs#ContainerDefinition} definition to directly connect
 * to the repository.
 */
export interface IContainerDirectRepositoryConnection {
  /**
   * Environment variables that configure a direct connection to the repository.
   */
  readonly containerEnvironment: { [name: string]: string };

  /**
   * A {@link MountPoint} that can be used to create a read/write mount the repository file-system from the task's
   * container instance into a container. This can be used with the `addMountPoint` method of the
   * {@link @aws-cdk/aws-ecs#ContainerDefinition} instance.
   */
  readonly readWriteMountPoint: MountPoint;

  /**
   * A {@link MountPoint} that can be used to create a read/write mount the repository file-system from the task's
   * container instance into a container. This can be used with the `addMountPoint` method of the
   * {@link @aws-cdk/aws-ecs#ContainerDefinition} instance.
   */
  readonly readOnlyMountPoint: MountPoint;
}

/**
 *  The Properties used to configure Deadline, that is running in an Amazon EC2 instance, a direct connection with a repository.
 */
export interface InstanceDirectConnectProps {
  /**
   * The Instance/UserData which will directly connect to the Repository
   */
  readonly host: IHost;

  /**
   * The location where the Repositories file system will be mounted on the instance.
   */
  readonly mountPoint: string;
}

/**
 * Interface for Deadline Repository.
 */
export interface IRepository extends IConstruct {
  /**
   * The path to the Deadline Repository directory.
   *
   * This is expressed as a relative path from the root of the Deadline Repository file-system.
   */
  readonly rootPrefix: string;

  /**
   * The version of Deadline for Linux that is installed on this Repository.
   */
  readonly version: IVersion;

  /**
   * Configures an ECS Container Instance and Task Definition for deploying a Deadline Client that directly connects to
   * this repository.
   *
   * This includes:
   *   - Ingress to database & filesystem Security Groups, as required.
   *   - IAM Permissions for database & filesystem, as required.
   *   - Mounts the Repository File System via UserData
   *
   * @param props The props used to configure the Deadline client.
   * @returns A mapping of environment variable names and their values to set in the container
   */
  configureClientECS(props: ECSDirectConnectProps): IContainerDirectRepositoryConnection;

  /**
   * Configure a Deadline Client, that is running in an Amazon EC2 instance, for direct connection to this repository.
   * This includes:
   *   - Ingress to database & filesystem Security Groups, as required.
   *   - IAM Permissions for database & filesystem, as required.
   *   - Mounts the Repository File System via UserData
   *   - Configures Deadline to direct-connect to the Repository.
   *
   * @param props The props used to configure the Deadline client.
   */
  configureClientInstance(props: InstanceDirectConnectProps): void;
}

/**
 * Properties for backups of resources that are created by the Repository.
 */
export interface RepositoryBackupOptions {
  /**
   * If this Repository is creating its own Amazon DocumentDB database, then this specifies the retention period to
   * use on the database. If the Repository is not creating a DocumentDB database, because one was given,
   * then this property is ignored.
   * Please visit https://aws.amazon.com/documentdb/pricing/ to learn more about DocumentDB backup storage pricing.
   *
   * @default Duration.days(15)
   */
  readonly databaseRetention?: Duration;
}

/*
 * Properties that define the removal policies of resources that are created by the Repository. These define what happens
 * to the resources when the stack that defines them is destroyed.
 */
export interface RepositoryRemovalPolicies {
  /**
   * If this Repository is creating its own Amazon DocumentDB database, then this specifies the retention policy to
   * use on the database. If the Repository is not creating a DocumentDB database, because one was given,
   * then this property is ignored.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly database?: RemovalPolicy;

  /**
   * If this Repository is creating its own Amazon Elastic File System (EFS), then this specifies the retention policy to
   * use on the filesystem. If the Repository is not creating an EFS, because one was given, then this property is ignored.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly filesystem?: RemovalPolicy;
}

/**
 * Properties for the Deadline repository
 */
export interface RepositoryProps {
  /**
   * VPC to launch the Repository In
   */
  readonly vpc: IVpc;

  /**
   * Version property to specify the version of deadline repository to be installed.
   * This, in future, would be an optional property. If not passed, it should fetch
   * the latest version of deadline. The current implementation of Version construct
   * only supports importing it with static values, hence keeping it mandatory for now.
   */
  readonly version: IVersion;

  /**
   * Properties for setting up the Deadline Repository's LogGroup in CloudWatch
   * @default - LogGroup will be created with all properties' default values to the LogGroup: /renderfarm/<construct id>
   */
  readonly logGroupProps?: LogGroupFactoryProps;

  /**
   * The length of time to wait for the repository installation before considering it as failure.
   *
   * The maximum value is 43200 (12 hours).
   *
   * @default Duration.minutes(15)
   */
  readonly repositoryInstallationTimeout?: Duration;

  /**
   * Specify the file system where the deadline repository needs to be initialized.
   *
   * @default An Encrypted EFS File System will be created
   */
  readonly fileSystem?: IMountableLinuxFilesystem;

  /**
   * The prefix for the deadline repository installation path on the given file system.
   *
   * @default: "/DeadlineRepository/"
   */
  readonly repositoryInstallationPrefix?: string;

  /**
   * Specify the database where the deadline schema needs to be initialized.
   *
   * @default A Document DB Cluster will be created with a single db.r5.large instance.
   */
  readonly database?: DatabaseConnection;

  /**
   * Define the removal policies for the resources that this Repository creates. These define what happens
   * to the resoureces when the stack that defines them is destroyed.
   *
   * @default RemovalPolicy.RETAIN for all resources
   */
  readonly removalPolicy?: RepositoryRemovalPolicies;

  /**
   * If this Repository is creating its own Amazon DocumentDB database, then this specifies the number of
   * compute instances to be created.
   *
   * @default 1
   */
  readonly documentDbInstanceCount?: number;

  /**
   * If this Repository is creating its own Amazon DocumentDB database and/or Amazon Elastic File System (EFS),
   * then this specifies to which subnets they are deployed.
   *
   * @default: Private subnets in the VPC
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Define the backup options for the resources that this Repository creates.
   *
   * @default Duration.days(15) for the database
   */
  readonly backupOptions?: RepositoryBackupOptions;
}

/**
 * This construct represents the main Deadline Repository which contains the central database and file system
 * that Deadline requires.
 *
 * When deployed this construct will start up a single instance which will run the Deadline Repository installer to
 * initialize the file system and database, the logs of which will be forwarded to Cloudwatch via a CloudWatchAgent.
 * After the installation is complete the instance will be shutdown.
 *
 * Whenever the stack is updated if a change is detected in the installer a new instance will be started, which will perform
 * a check on the existing Deadline Repository.  If they are compatible with the new installer an update will be performed
 * and the deployment will continue, otherwise the the deployment will be cancelled.
 * In either case the instance will be cleaned up.
 *
 * Resources Deployed
 * ------------------------
 * 1) Encrypted EFS File System - If no IFileSystem is provided;
 * 2) DocumentDB and DatabaseConnection - If no database connection is provided;
 * 3) Auto Scaling Group (ASG) with min & max capacity of 1 instance;
 * 4) Instance Role and corresponding IAM Policy
 * 5) A Script Asset which is uploaded to your deployment bucket to run the installer
 * 6) An aws-rfdk.CloudWatchAgent to configure sending logs to cloudwatch.
 *
 * Residual Risk
 * ------------------------
 * The instance in the AutoScaling group is given a role with the following permissions:
 * - Read permissions to the bucket containing the S3 Assets
 *
 * The Following Security Group changes are made by this construct:
 * - TCP access to the DocumentDB Cluster over it's default port
 * - TCP access to the Provided File system over it's default port
 *
 * @ResourcesDeployed
 * @ResidualRisk
 */
export class Repository extends Construct implements IRepository {
  /**
   * Default file system mount path for repository
   */
  private static DEFAULT_FILE_SYSTEM_MOUNT_PATH: string = '/mnt/efs/fs1';

  /**
   * Default installation prefix for deadline repository.
   */
  private static DEFAULT_REPO_PREFIX: string = 'DeadlineRepository';

  /**
   * Default prefix for a LogGroup if one isn't provided in the props.
   */
  private static DEFAULT_LOG_GROUP_PREFIX: string = '/renderfarm/';

  /**
   * How often Cloudwatch logs will be flushed.
   */
  private static CLOUDWATCH_LOG_FLUSH_INTERVAL: Duration = Duration.seconds(15);

  /**
   * The name of the volume used in ECS task definitions to mount the repository file-system mounted on EC2 hosts into
   * containers.
   */
  private static ECS_VOLUME_NAME = 'RepositoryFilesystem';

  /**
   * The default number of DocDB instances if one isn't provided in the props.
   */
  private static DEFAULT_NUM_DOCDB_INSTANCES: number = 1;

  /**
   * Default retention period for DocumentDB automated backups if one isn't provided in the props.
   */
  private static DEFAULT_DATABASE_RETENTION_PERIOD: Duration = Duration.days(15);

  /**
   * @inheritdoc
   */
  public readonly rootPrefix: string;

  /**
   * @inheritdoc
   */
  public readonly version: IVersion;

  /**
   * Connection object for the database for this repository.
   */
  public readonly databaseConnection: DatabaseConnection;

  /**
   * The Linux-mountable filesystem that will store the Deadline repository filesystem contents.
   */
  public readonly fileSystem: IMountableLinuxFilesystem;

  /**
   * The autoscaling group for this repository's installer-running instance.
   */
  private readonly installerGroup: AutoScalingGroup;

  constructor(scope: Construct, id: string, props: RepositoryProps) {
    super(scope, id);

    if (props.database && props.backupOptions?.databaseRetention) {
      this.node.addWarning('Backup retention for database will not be applied since a database is not being created by this construct');
    }
    if (props.fileSystem && props.removalPolicy?.filesystem) {
      this.node.addWarning('RemovalPolicy for filesystem will not be applied since a filesystem is not being created by this construct');
    }
    if (props.database && props.removalPolicy?.database) {
      this.node.addWarning('RemovalPolicy for database will not be applied since a database is not being created by this construct');
    }

    this.version = props.version;

    // Set up the Filesystem and Database components of the repository
    this.fileSystem = props.fileSystem ?? new MountableEfs(this, {
      filesystem: new EfsFileSystem(this, 'FileSystem', {
        vpc: props.vpc,
        vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE },
        encrypted: true,
        lifecyclePolicy: EfsLifecyclePolicy.AFTER_14_DAYS,
        removalPolicy: props.removalPolicy?.filesystem ?? RemovalPolicy.RETAIN,
      }),
    });

    if (props.database) {
      this.databaseConnection = props.database;
    } else {
      const instances = props.documentDbInstanceCount ?? Repository.DEFAULT_NUM_DOCDB_INSTANCES;
      const dbCluster = new DatabaseCluster(this, 'DocumentDatabase', {
        masterUser: {username: 'DocDBUser'},
        instanceProps: {
          instanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
          vpc: props.vpc,
          vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.PRIVATE, onePerAz: true },
        },
        instances,
        backup: {
          retention: props.backupOptions?.databaseRetention ?? Repository.DEFAULT_DATABASE_RETENTION_PERIOD,
        },
        removalPolicy: props.removalPolicy?.database ?? RemovalPolicy.RETAIN,
      });
      /* istanbul ignore next */
      if (!dbCluster.secret) {
        /* istanbul ignore next */
        throw new Error('DBCluster failed to get set up properly -- missing login secret.');
      }

      // This is a workaround because of the bug in CDK implementation:
      // autoMinorVersionUpgrade should be true by default but it's not.
      // This code can be removed once fixed in CDK.
      for (let i = 1; i <= instances; i++) {
        const docdbInstance = dbCluster.node.tryFindChild(`Instance${ i }`) as CfnDBInstance;
        docdbInstance.autoMinorVersionUpgrade = true;
      }

      this.databaseConnection = DatabaseConnection.forDocDB({
        database: dbCluster,
        login: dbCluster.secret,
      });
    }

    // Launching the instance which installs the deadline repository in the stack.
    this.installerGroup = new AutoScalingGroup(this, 'Installer', {
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
      },
      minCapacity: 1,
      maxCapacity: 1,
      resourceSignalTimeout: (props.repositoryInstallationTimeout || Duration.minutes(15)),
      updateType: UpdateType.REPLACING_UPDATE,
      replacingUpdateMinSuccessfulInstancesPercent: 100,
    });
    this.node.defaultChild = this.installerGroup;
    // Ensure the DB is serving before we try to connect to it.
    this.databaseConnection.addChildDependency(this.installerGroup);

    // Updating the user data with installation logs stream -- ALWAYS DO THIS FIRST.
    this.configureCloudWatchLogStream(this.installerGroup, `${id}`, props.logGroupProps);

    this.setupDirectConnect(this.installerGroup, Repository.DEFAULT_FILE_SYSTEM_MOUNT_PATH);

    this.rootPrefix = props.repositoryInstallationPrefix || Repository.DEFAULT_REPO_PREFIX;
    if (path.posix.isAbsolute(this.rootPrefix)) {
      // If the input path is absolute, then we make it relative (to the root of the repo file-system)
      this.rootPrefix = path.posix.relative(
        path.posix.sep,
        this.rootPrefix,
      );
    }
    const repositoryInstallationPath = path.posix.normalize(path.posix.join(Repository.DEFAULT_FILE_SYSTEM_MOUNT_PATH, this.rootPrefix));

    // Updating the user data with deadline repository installation commands.
    this.configureRepositoryInstallerScript(
      this.installerGroup,
      repositoryInstallationPath,
      props.version,
    );

    this.configureSelfTermination();

    // Updating the user data with successful cfn-signal commands.
    this.installerGroup.userData.addSignalOnExitCommand(this.installerGroup);
  }

  /**
   * @inheritdoc
   */
  public configureClientECS(props: ECSDirectConnectProps): IContainerDirectRepositoryConnection {
    const hostMountPoint = props.containerInstances.filesystemMountPoint ?? '/mnt/repo';
    const containerMountPoint = props.containers.filesystemMountPoint ?? `/opt/Thinkbox/DeadlineRepository${this.version.majorVersion}`;

    // Set up a direct connection on the host machine. This:
    //  - grants IAM permissions to the role associated with the instance profile access to
    //    - the file-system
    //    - the DB secret containing the credentials
    //  - adds a security group ingress rule to the DB cluster and file-system
    //  - adds userdata commands to mount the repository file-system on the host
    props.containerInstances.hosts.forEach(host => {
      this.setupDirectConnect(host, hostMountPoint);
    });

    // Build up a mapping of environment variables that are used to configure the container's direct connection to the
    // repository
    const containerEnvironment: { [name: string]: string } = {
      REPO_URI: pathToFileURL(containerMountPoint).toString(),
    };

    // The role associated with the task definition needs access to connect to the database
    this.databaseConnection.grantRead(props.containers.taskDefinition.taskRole);

    // Add any environment variables specified by the connection
    Object.entries(this.databaseConnection.containerEnvironment).forEach((entry: [string, string]) => {
      const [envVarName, envVarValue] = entry;
      containerEnvironment[envVarName] = envVarValue;
    });

    // Add an explicit dependency on the Repository. This ensures that deployments of the Repository construct precede
    // deployments of the client and the repository is fully setup.
    props.containers.taskDefinition.node.addDependency(this);

    // Configure a named volume in the task-definition that points to the container host's mount-point of the repository
    // file-system
    props.containers.taskDefinition.addVolume({
      name: Repository.ECS_VOLUME_NAME,
      host: {
        sourcePath: path.posix.normalize(path.posix.join(hostMountPoint, this.rootPrefix)),
      },
    });

    // Return the container connection. This data structure contains all the pieces needed to create containers
    // that can directly connect to the repository.
    return {
      containerEnvironment,
      readOnlyMountPoint: {
        containerPath: containerMountPoint,
        readOnly: true,
        sourceVolume: Repository.ECS_VOLUME_NAME,
      },
      readWriteMountPoint: {
        containerPath: containerMountPoint,
        readOnly: false,
        sourceVolume: Repository.ECS_VOLUME_NAME,
      },
    };
  }

  /**
   * @inheritdoc
   */
  public configureClientInstance(props: InstanceDirectConnectProps): void {
    // Add an explicit dependency on the Repository. This ensures that deployments of the Repository construct precede
    // deployments of the client and the repository is fully setup.
    props.host.node.addDependency(this);

    this.setupDirectConnect(props.host, props.mountPoint);

    const stack = Stack.of(this);
    const uuid = 'f625e47b-7aed-4879-9861-513a72145525';
    const uniqueId = 'DeadlineRepository' + props.host.osType + uuid.replace(/[-]/g, '');
    const configureDirectConnect = (stack.node.tryFindChild(uniqueId) as ScriptAsset) ?? ScriptAsset.fromPathConvention(stack, uniqueId, {
      osType: props.host.osType,
      baseName: 'configureRepositoryDirectConnect',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts',
      ),
    });

    configureDirectConnect.grantRead(props.host);

    this.databaseConnection.addConnectionDBArgs(props.host);

    const repoPath = path.posix.normalize(path.posix.join(props.mountPoint, this.rootPrefix));

    configureDirectConnect.executeOn({
      host: props.host,
      args: [ `"${repoPath}"` ],
    });
  }

  /**
   * Set up direct connect to this repo for the given host. Specifically:
   *  - IAM permissions & security group access to the database.
   *  - mounting the repository filesystem
   *
   * @param host Host to setup.
   * @param repositoryMountPoint Absolute directory at which to mount the repo filesystem.
   *
   * @remark Only allowable for Windows hosts.
   */
  private setupDirectConnect(host: IHost, repositoryMountPoint: string) {
    if (host.osType === OperatingSystemType.WINDOWS) {
      throw new Error('Deadline direct connect on Windows hosts is not yet supported by the RFDK.');
    }
    this.databaseConnection.grantRead(host);
    this.databaseConnection.allowConnectionsFrom(host);
    this.fileSystem.mountToLinuxInstance(host, {
      location: repositoryMountPoint,
    });
  }

  /**
   * Adds UserData commands to configure the CloudWatch Agent running on the instance that performs the repository
   * installation.
   *
   * The commands configure the agent to stream the following logs to a new CloudWatch log group:
   *   - The cloud-init log
   *   - The Deadline Repo's installer log
   *
   * @param installerGroup The instance that performs the Deadline Repository installation
   * @param logGroupProps
   */
  private configureCloudWatchLogStream(installerGroup: AutoScalingGroup, groupName: string, logGroupProps?: LogGroupFactoryProps) {
    const prefix = logGroupProps?.logGroupPrefix ? logGroupProps.logGroupPrefix : Repository.DEFAULT_LOG_GROUP_PREFIX;
    const defaultedLogGroupProps = {
      ...logGroupProps,
      logGroupPrefix: prefix,
    };
    const logGroup = LogGroupFactory.createOrFetch(this, 'RepositoryLogGroupWrapper', groupName, defaultedLogGroupProps);

    logGroup.grantWrite(installerGroup);

    const cloudWatchConfigurationBuilder = new CloudWatchConfigBuilder(Repository.CLOUDWATCH_LOG_FLUSH_INTERVAL);

    cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
      'cloud-init-output',
      '/var/log/cloud-init-output.log');
    cloudWatchConfigurationBuilder.addLogsCollectList(logGroup.logGroupName,
      'deadlineRepositoryInstallationLogs',
      '/tmp/bitrock_installer.log');

    new CloudWatchAgent(this, 'RepositoryInstallerLogsConfig', {
      cloudWatchConfig: cloudWatchConfigurationBuilder.generateCloudWatchConfiguration(),
      host: installerGroup,
    });
  }

  private configureSelfTermination() {
    const tagKey = 'resourceLogicalId';
    /*
    Add a policy to the ASG that allows it to modify itself. We cannot add the ASG name in resources
    as it will cause cyclic dependency. Hence, using Condition Keys
    */
    const tagCondition: { [key: string]: any } = {};
    tagCondition[`autoscaling:ResourceTag/${tagKey}`] = this.node.uniqueId;

    Tag.add(this.installerGroup, tagKey, this.node.uniqueId);

    this.installerGroup.addToRolePolicy(new PolicyStatement({
      actions: [
        'autoscaling:UpdateAutoScalingGroup',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: tagCondition,
      },
    }));

    // Following policy is required to read the aws tags within the instance
    this.installerGroup.addToRolePolicy(new PolicyStatement({
      actions: [
        'ec2:DescribeTags',
      ],
      resources: ['*'],
    }));

    // wait for the log flush interval to make sure that all the logs gets flushed.
    // this wait can be avoided in future by using a life-cycle-hook on 'TERMINATING' state.
    const terminationDelay = Math.ceil(Repository.CLOUDWATCH_LOG_FLUSH_INTERVAL.toMinutes({integral: false}));
    this.installerGroup.userData.addOnExitCommands(`sleep ${terminationDelay}m`);

    // fetching the instance id and asg name and then setting all the capacity to 0 to terminate the installer.
    this.installerGroup.userData.addOnExitCommands('INSTANCE="$(curl http://169.254.169.254/latest/meta-data/instance-id)"');
    this.installerGroup.userData.addOnExitCommands('ASG="$(aws --region ' + Stack.of(this).region + ' ec2 describe-tags --filters "Name=resource-id,Values=${INSTANCE}" "Name=key,Values=aws:autoscaling:groupName" --query "Tags[0].Value" --output text)"');
    this.installerGroup.userData.addOnExitCommands('aws --region ' + Stack.of(this).region + ' autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 0 --max-size 0 --desired-capacity 0');
  }

  private configureRepositoryInstallerScript(
    installerGroup: AutoScalingGroup,
    installPath: string,
    version: IVersion) {
    const installerScriptAsset = ScriptAsset.fromPathConvention(this, 'DeadlineRepositoryInstallerScript', {
      osType: installerGroup.osType,
      baseName: 'installDeadlineRepository',
      rootDir: path.join(
        __dirname,
        '..',
        'scripts',
      ),
    });

    this.databaseConnection.addInstallerDBArgs(installerGroup);

    if (!version.linuxInstallers?.repository) {
      throw new Error('Version given to Repository must provide a Linux Repository installer.');
    }
    const linuxVersionString = version.linuxFullVersionString();
    if (!linuxVersionString) {
      throw new Error('Version given to Repository must provide a full Linux version string.');
    }
    version.linuxInstallers.repository.s3Bucket.grantRead(installerGroup, version.linuxInstallers.repository.objectKey);

    installerScriptAsset.executeOn({
      host: installerGroup,
      args: [
        `"s3://${version.linuxInstallers.repository.s3Bucket.bucketName}/${version.linuxInstallers.repository.objectKey}"`,
        `"${installPath}"`,
        linuxVersionString,
      ],
    });
  }
}
