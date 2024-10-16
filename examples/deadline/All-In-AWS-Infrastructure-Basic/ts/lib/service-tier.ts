/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  BlockDeviceVolume,
  IVpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  IPrivateHostedZone,
} from 'aws-cdk-lib/aws-route53';
import * as cdk from 'aws-cdk-lib';
import {
  MountableEfs,
  X509CertificatePem,
} from 'aws-rfdk';
import {
  AwsCustomerAgreementAndIpLicenseAcceptance,
  DatabaseConnection,
  RenderQueue,
  Repository,
  ThinkboxDockerImages,
  UsageBasedLicense,
  UsageBasedLicensing,
  VersionQuery,
} from 'aws-rfdk/deadline';
import {
  Secret,
} from 'aws-cdk-lib/aws-secretsmanager';
import { SessionManagerHelper } from 'aws-rfdk/lib/core';
import { Construct } from 'constructs';

import { Subnets } from './subnets';

/**
 * Properties for {@link ServiceTier}.
 */
export interface ServiceTierProps extends cdk.StackProps {
  /**
   * The VPC to deploy service tier resources into.
   */
  readonly vpc: IVpc;

  /**
   * The database to connect to.
   */
  readonly database: DatabaseConnection;

  /**
   * The file-system to install Deadline Repository to.
   */
  readonly mountableFileSystem: MountableEfs;

  /**
   * Our self-signed root CA certificate for the internal endpoints in the farm.
   */
  readonly rootCa: X509CertificatePem;

  /**
   * Internal DNS zone for the VPC.
   */
  readonly dnsZone: IPrivateHostedZone;

  /**
   * The ARN of the secret containing the UBL certificates .zip file (in binary form).
   * @default - UBL will not be set up
   */
  readonly ublCertsSecretArn?: string;

  /**
   * The UBL licenses to configure.
   * @default - No UBL licenses will be configured
   */
  readonly ublLicenses?: UsageBasedLicense[];

  /**
   * Version of Deadline to use.
   * @default - The latest available release of Deadline is used
   */
  readonly deadlineVersion?: string;

  /**
   * Whether the AWS Customer Agreement and AWS Intellectual Property License are agreed to.
   */
  readonly userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;

  /**
   * Whether to enable Deadline Secrets Management.
   */
   readonly enableSecretsManagement: boolean;

  /**
   * The ARN of the AWS Secret containing the admin credentials for Deadline Secrets Management.
   * @default - If Deadline Secrets Management is enabled, an AWS Secret with admin credentials will be generated.
   */
   readonly secretsManagementSecretArn?: string;
}

/**
 * The service tier contains all "business-logic" constructs (e.g. Render Queue, UBL Licensing / License Forwarder, etc.).
 */
export class ServiceTier extends cdk.Stack {
  /**
   * A bastion host to connect to the render farm with.
   */
  public readonly bastion: BastionHostLinux;

  /**
   * The render queue.
   */
  public readonly renderQueue: RenderQueue;

  /**
   * The UBL licensing construct. (License Forwarder)
   */
  public readonly ublLicensing?: UsageBasedLicensing;

  /**
   * The version of Deadline configured by the app.
   */
  public readonly version: VersionQuery;

  /**
   * Initializes a new instance of {@link ServiceTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for this construct.
   */
  constructor(scope: Construct, id: string, props: ServiceTierProps) {
    super(scope, id, props);

    // Bastion instance for convenience (e.g. SSH into RenderQueue and WorkerFleet instances).
    // Not a critical component of the farm, so this can be safely removed. An alternative way
    // to access your hosts is also provided by the Session Manager, which is also configured
    // later in this example.
    this.bastion = new BastionHostLinux(this, 'Bastion', {
      vpc: props.vpc,
      subnetSelection: {
        subnetGroupName: Subnets.PUBLIC.name,
      },
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(50, {
          encrypted: true,
        })},
      ],
    });
    props.database.allowConnectionsFrom(this.bastion);

    // Granting the bastion access to the entire EFS file-system.
    // This can also be safely removed
    new MountableEfs(this, {
      filesystem: props.mountableFileSystem.fileSystem,
    }).mountToLinuxInstance(this.bastion.instance, {
      location: '/mnt/efs',
    });

    this.version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    const repository = new Repository(this, 'Repository', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: Subnets.INFRASTRUCTURE.name,
      },
      version: this.version,
      database: props.database,
      fileSystem: props.mountableFileSystem,
      repositoryInstallationTimeout: cdk.Duration.minutes(30),
      repositoryInstallationPrefix: "/",
      secretsManagementSettings: {
        enabled: props.enableSecretsManagement,
        credentials: props.secretsManagementSecretArn ? Secret.fromSecretCompleteArn(this, 'SMAdminUser', props.secretsManagementSecretArn) : undefined,
      },
    });

    const images = new ThinkboxDockerImages(this, 'Images', {
      version: this.version,
      userAwsCustomerAgreementAndIpLicenseAcceptance: props.userAwsCustomerAgreementAndIpLicenseAcceptance,
    });

    const serverCert = new X509CertificatePem(this, 'RQCert', {
      subject: {
        cn: `renderqueue.${props.dnsZone.zoneName}`,
        o: 'RFDK-Sample',
        ou: 'RenderQueueExternal',
      },
      signingCertificate: props.rootCa,
    });

    this.renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: Subnets.INFRASTRUCTURE.name,
      },
      /**
       * It is considered good practice to put the Render Queue's load blanacer in dedicated subnets because:
       *
       * 1. Deadline Secrets Management identity registration settings will be scoped down to least-privilege
       *
       *    (see https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/lib/deadline/README.md#render-queue-subnet-placement)
       *
       * 2. The load balancer can scale to use IP addresses in the subnet without conflicts from other AWS resources
       *
       *    (see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer)
       */
      vpcSubnetsAlb: {
        subnetGroupName: Subnets.RENDER_QUEUE_ALB.name,
      },
      images: images,
      repository,
      hostname: {
        hostname: 'renderqueue',
        zone: props.dnsZone,
      },
      trafficEncryption: {
        externalTLS: {
          rfdkCertificate: serverCert,
        },
        internalProtocol: ApplicationProtocol.HTTPS,
      },
      version: this.version,
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
      // Enable a local transparent filesystem cache of the Repository filesystem to reduce
      // data traffic from the Repository's filesystem.
      // For an EFS and NFS filesystem, this requires the 'fsc' mount option.
      enableLocalFileCaching: true,
    });
    this.renderQueue.connections.allowDefaultPortFrom(this.bastion);

    // This is an optional feature that will set up your EC2 instances to be enabled for use with
    // the Session Manager. RFDK deploys EC2 instances that aren't available through a public subnet,
    // so connecting to them by SSH isn't easy. This is an option to quickly access hosts without
    // using a bastion instance.
    // It's important to note that the permissions need to be granted to the render queue's ASG,
    // rather than the render queue itself.
    SessionManagerHelper.grantPermissionsTo(this.renderQueue.asg);

    if (props.ublLicenses) {
      if (!props.ublCertsSecretArn) {
        throw new Error('UBL licenses were set but no UBL Certs Secret Arn was set.');
      }
      const ublCertSecret = Secret.fromSecretCompleteArn(this, 'UBLCertsSecret', props.ublCertsSecretArn);

      this.ublLicensing = new UsageBasedLicensing(this, 'UBLLicensing', {
        vpc: props.vpc,
        vpcSubnets: {
          subnetGroupName: Subnets.USAGE_BASED_LICENSING.name,
        },
        images: images,
        licenses: props.ublLicenses,
        renderQueue: this.renderQueue,
        certificateSecret: ublCertSecret,
      });

      // Another optional usage of the SessionManagerHelper that demonstrates how to configure the UBL
      // construct's ASG for access. Note that this construct also requires you to apply the permissions
      // to its ASG property.
      SessionManagerHelper.grantPermissionsTo(this.ublLicensing.asg);
    }
  }
}
