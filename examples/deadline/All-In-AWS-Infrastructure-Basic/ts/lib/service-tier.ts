/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  BlockDeviceVolume,
  IVpc,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IPrivateHostedZone,
} from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import {
  IMountableLinuxFilesystem,
  X509CertificatePem,
} from 'aws-rfdk';
import {
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
} from '@aws-cdk/aws-secretsmanager';
import { Duration } from '@aws-cdk/core';
import { SessionManagerHelper } from 'aws-rfdk/lib/core';

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
   * The file system to install Deadline Repository to.
   */
  readonly fileSystem: IMountableLinuxFilesystem;

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
   * @default The latest available release of Deadline is used
   */
  readonly deadlineVersion?: string;
}

/**
 * The service tier contains all "business-logic" constructs (e.g. Render Queue, UBL Licensing / License Forwarder, etc.).
 */
export class ServiceTier extends cdk.Stack {
  /**
   * The repository
   */
  public readonly repository: Repository;

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
  constructor(scope: cdk.Construct, id: string, props: ServiceTierProps) {
    super(scope, id, props);

    // Bastion instance for convenience (e.g. SSH into RenderQueue and WorkerFleet instances).
    // Not a critical component of the farm, so this can be safely removed. An alternative way
    // to access your hosts is also provided by the Session Manager, which is also configured
    // later in this example.
    this.bastion = new BastionHostLinux(this, 'Bastion', {
      vpc: props.vpc,
      subnetSelection: {
        subnetType: SubnetType.PUBLIC,
      },
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(50, {
          encrypted: true,
        })},
      ]
    });
    // Granting the bastion access to the file system mount for convenience
    // This can also be safely removed
    props.fileSystem.mountToLinuxInstance(this.bastion.instance, {
      location: '/mnt/efs',
    });

    this.version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion
    });

    this.repository = new Repository(this, 'Repository', {
      vpc: props.vpc,
      version: this.version,
      database: props.database,
      fileSystem: props.fileSystem,
      repositoryInstallationTimeout: Duration.minutes(20),
    });

    const images = new ThinkboxDockerImages(this, 'Images', {
      version: this.version,
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
      images: images,
      repository: this.repository,
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
