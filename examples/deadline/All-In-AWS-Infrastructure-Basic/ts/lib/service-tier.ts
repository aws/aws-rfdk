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
  IRenderQueue,
  RenderQueue,
  Repository,
  Stage,
  ThinkboxDockerRecipes,
  UsageBasedLicense,
  UsageBasedLicensing,
} from 'aws-rfdk/deadline';
import {
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import { Duration } from '@aws-cdk/core';

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
   * The path to the directory where the staged Deadline Docker recipes are.
   */
  readonly dockerRecipesStagePath: string;

  /**
   * The ARN of the secret containing the UBL certificates .zip file (in binary form).
   */
  readonly ublCertsSecretArn: string;

  /**
   * The UBL licenses to configure.
   */
  readonly ublLicenses: UsageBasedLicense[];

  /**
   * Our self-signed root CA certificate for the internal endpoints in the farm.
   */
  readonly rootCa: X509CertificatePem;

  /**
   * Internal DNS zone for the VPC.
   */
  readonly dnsZone: IPrivateHostedZone;
}

/**
 * The service tier contains all "business-logic" constructs (e.g. Render Queue, UBL Licensing / License Forwarder, etc.).
 */
export class ServiceTier extends cdk.Stack {
  /**
   * The render queue.
   */
  public readonly renderQueue: IRenderQueue;

  /**
   * The UBL licensing construct. (License Forwarder)
   */
  public readonly ublLicensing: UsageBasedLicensing;

  /**
   * A bastion host to connect to the render farm with.
   */
  public readonly bastion: BastionHostLinux;

  /**
   * Initializes a new instance of {@link ServiceTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The properties for this construct.
   */
  constructor(scope: cdk.Construct, id: string, props: ServiceTierProps) {
    super(scope, id, props);

    // Bastion instance for convenience (e.g. SSH into RenderQueue and WorkerFleet instances)
    // Not a critical component of the farm, so this can be safely removed
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

    const recipes = new ThinkboxDockerRecipes(this, 'Image', {
      stage: Stage.fromDirectory(props.dockerRecipesStagePath),
    });

    const repository = new Repository(this, 'Repository', {
      vpc: props.vpc,
      version: recipes.version,
      database: props.database,
      fileSystem: props.fileSystem,
      repositoryInstallationTimeout: Duration.minutes(20),
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
      images: recipes.renderQueueImages,
      repository: repository,
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
      version: recipes.version,
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
    });
    this.renderQueue.connections.allowDefaultPortFrom(this.bastion);

    const ublCertSecret = Secret.fromSecretArn(this, 'UBLCertsSecret', props.ublCertsSecretArn);
    this.ublLicensing = new UsageBasedLicensing(this, 'UBLLicensing', {
      vpc: props.vpc,
      images: recipes.ublImages,
      licenses: props.ublLicenses,
      renderQueue: this.renderQueue,
      certificateSecret: ublCertSecret,
    });
  }
}
