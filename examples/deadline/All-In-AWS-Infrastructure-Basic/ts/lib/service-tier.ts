/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IVpc,
} from '@aws-cdk/aws-ec2';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IPrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';

import {
  MountableEfs,
  SessionManagerHelper,
  X509CertificatePem,
} from 'aws-rfdk';
import {
  AwsThinkboxEulaAcceptance,
  DatabaseConnection,
  RenderQueue,
  Repository,
  Stage,
  ThinkboxDockerImages,
  ThinkboxDockerRecipes,
  UsageBasedLicense,
  UsageBasedLicensing,
  VersionQuery,
} from 'aws-rfdk/deadline';
import * as path from 'path';

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
   * Whether the AWS Thinkbox End-User License Agreement is accepted or not
   */
  readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance;

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

    this.version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    const repository = new Repository(this, 'Repository', {
      vpc: props.vpc,
      version: this.version,
      database: props.database,
      fileSystem: props.mountableFileSystem,
      repositoryInstallationTimeout: cdk.Duration.minutes(20),
      repositoryInstallationPrefix: "/",
      secretsManagementSettings: {
        enabled: props.enableSecretsManagement,
        credentials: props.secretsManagementSecretArn ? Secret.fromSecretCompleteArn(this, 'SMAdminUser', props.secretsManagementSecretArn) : undefined,
      },
    });

    const serverCert = new X509CertificatePem(this, 'RQCert', {
      subject: {
        cn: `renderqueue.${props.dnsZone.zoneName}`,
        o: 'RFDK-Sample',
        ou: 'RenderQueueExternal',
      },
      signingCertificate: props.rootCa,
    });

    const recipes = new ThinkboxDockerRecipes(this, 'Recipes', {
      stage: Stage.fromDirectory(path.join(__dirname, "..", "stage")),
    });
    this.renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc: props.vpc,
      images: recipes.renderQueueImages,
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

      const images = new ThinkboxDockerImages(this, 'Images', {
        version: this.version,
        userAwsThinkboxEulaAcceptance: props.acceptAwsThinkboxEula,
      });
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
