/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DatabaseCluster,
} from '@aws-cdk/aws-docdb';
import {
  AmazonLinuxImage,
  AmazonLinuxGeneration,
  BastionHostLinux,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  FileSystem,
  LifecyclePolicy,
} from '@aws-cdk/aws-efs';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  ManagedPolicy,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  RetentionDays,
} from '@aws-cdk/aws-logs';
import {
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Bucket,
} from '@aws-cdk/aws-s3';
import {
  App,
  AppProps,
  Duration,
  RemovalPolicy,
  Stack,
} from '@aws-cdk/core';
import {
  MountableEfs,
  X509CertificatePem,
} from 'aws-rfdk';
import {
  DatabaseConnection,
  RenderQueue,
  Repository,
  ThinkboxDockerRecipes,
} from "aws-rfdk/deadline";

import { config } from "./config";

export class KitchenSinkApp extends App {
  constructor(props?: AppProps) {
    super(props);

    // Extract configuration from the config module
    const {
      // The deployment environment
      env,
      // A staged directory of Deadline and the associated resources needed to deploy RFDK constructs
      stage,
    } = config;

    /*******************************************************************************
     * VPC Stack
     *******************************************************************************
     *
     * The stack containing the VPC. This is kept in its own stack so we can
     * persist the VPC when we need to destroy dependent stacks during debug/deploy
     * iterations.
     *
     ******************************************************************************/
    const vpcStack = new Stack(this, 'VpcStack', {
        env
    });
    const vpc = new Vpc(vpcStack, 'Vpc', {
        cidr: '192.168.1.0/24',
        maxAzs: 2
    });
    const zone = new PrivateHostedZone(vpcStack, 'Zone', {
      vpc,
      zoneName: config.domainName,
    });
    const caCert = new X509CertificatePem(vpcStack, 'CaCert', {
      subject: {
        cn: `ca.${config.domainName}`,
      },
    });

    /*******************************************************************************
     * Infrastructure stack
     *******************************************************************************
     *
     * This stack contains long-running infrastructure such as databases and file
     * assets repositories. It should be persisted when destroying burst compute
     * infrastructure during periods of empty load on the render farm or during
     * software update deployments.
     *
     ******************************************************************************/
    const infrastructureStack = new Stack(this, 'InfrastructureStack', {
      env
    });

    /**
     * Elastic file system for storing deadline repository.
     */
    const fileSystem = new FileSystem(infrastructureStack, 'EfsFileSystem', {
      vpc,
      encrypted: true,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
    });
    const fileSystemMount = new MountableEfs(infrastructureStack, {
      filesystem: fileSystem,
    });

    /*
     * DocumentDB database cluster for storing the render farm database.
     */
    const database = new DatabaseCluster(infrastructureStack, 'DbCluster', {
      port: 27017,
      masterUser: {
        username: "master"
      },
      instanceProps: {
        instanceType: InstanceType.of(
          InstanceClass.R4,
          InstanceSize.LARGE
        ),
        vpc,
        vpcSubnets: {
          onePerAz: true,
          subnetType: SubnetType.PRIVATE
        }
      },
      /**
       * Default is to retain the DocDB cluster when deleting the stack. Since this is an example app, we will mark
       * the cluster to be destroyed. In production render farms, it might be safer to configure CDK and CloudFormation
       * to retain the cluster with CDK/CloudFormation and delete it manually.
       */
      removalPolicy: RemovalPolicy.DESTROY
    });

    /**
     * Bastion instance.
     *
     * This is an SSH gateway that is deployed to a public subnet in the render farm's VPC. It has:
     *
     * * the repository file system mounted
     * * security group rules to reach the database
     * *
     */
    const bastion = new BastionHostLinux(infrastructureStack, 'Bastion', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      vpc,
      subnetSelection: {
        subnetType: SubnetType.PUBLIC,
      },
    });
    fileSystemMount.mountToLinuxInstance(bastion.instance, {
      location: '/mnt/efs',
    });

    const recipes = new ThinkboxDockerRecipes(infrastructureStack, 'DockerRecipes', {
      stage,
    });

    /**
     * Allow network traffic from the bastion to the database cluster
     */
    bastion.connections.allowTo(database, Port.tcp(database.clusterEndpoint.port));

    const repoStack = new Stack(this, 'RepositoryStack', { env });

    const logBucket = new Bucket(repoStack, 'LogBucket', { removalPolicy: RemovalPolicy.DESTROY });
    logBucket.grantReadWrite(new ServicePrincipal('logs.amazonaws.com'));

    const version = recipes.version;

    /**
     * Creating a resource which installs the deadline repository.
     */
    const repository = new Repository(repoStack, 'Repository', {
      vpc,
      fileSystem: fileSystemMount,
      database: DatabaseConnection.forDocDB({
        database,
        login: database.secret!
      }),
      repositoryInstallationTimeout: Duration.minutes(20),
      logGroupProps: {
        bucketName: logBucket.bucketName,
        logGroupPrefix: 'kitchen-sink-',
        retention: RetentionDays.ONE_DAY,
      },
      version,
    });

    const rqStack = new Stack(this, 'RenderQueueStack', { env });
    const rqCertPem = new X509CertificatePem(rqStack, 'RenderQueueCertPEM', {
      subject: {
        cn: `renderqueue.${config.domainName}`
      },
      signingCertificate: caCert,
    });

    const rqLogBucket = new Bucket(rqStack, 'RQAccessBucket');

    /**
     * Create a render queue. This is the service that backs the REST API for clients connecting to the render farm.
     */
    const renderQueue = new RenderQueue(rqStack, 'RenderQueue', {
      images: recipes.renderQueueImages,
      repository,
      version,
      vpc,
      hostname: {
        zone,
        hostname: config.renderQueueHostname,
      },
      trafficEncryption: {
        externalTLS: {
          rfdkCertificate: rqCertPem,
        },
        internalProtocol: ApplicationProtocol.HTTP,
      },
      accessLogs: {
        destinationBucket: rqLogBucket,
      },
    });

    // Add the AWS Managed SSM role to the ASG container instances.
    // This allows the use of Session Manager which can be found in the System Manager AWS console to establish a
    // remote shell session on the ECS container instances. This is useful to troubleshoot when containers arent't
    // operating correctly.
    renderQueue.asg.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    // Allow the bastion to connect to the Render Queue's default port (HTTP or HTTPS).
    renderQueue.connections.allowDefaultPortFrom(bastion);
  }
}
