/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BastionHostLinux,
  BlockDeviceVolume,
  IVpc,
  SubnetSelection,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import {
  ApplicationProtocol,
} from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  IPrivateHostedZone,
} from '@aws-cdk/aws-route53';
import {
  Construct,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from '@aws-cdk/core';
import {
  X509CertificatePem,
} from 'aws-rfdk';
import {
  AwsThinkboxEulaAcceptance,
  RenderQueue,
  Repository,
  ThinkboxDockerImages,
  VersionQuery,
} from 'aws-rfdk/deadline';

/**
 * Properties for {@link ServiceTier}.
 */
export interface ServiceTierProps extends StackProps {
  /**
   * The VPC to deploy service tier resources into.
   */
  readonly vpc: IVpc;

  /**
   * Whether the AWS Thinkbox End-User License Agreement is accepted or not
   */
  readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance;

  /**
   * The availability zones that components in this stack will be deployed into. These should all be in the same
   * region and only be standard availability zones, as some constucts use services that aren't available in
   * local zones yet.
   */
  readonly availabilityZones: string[],

  /**
   * Internal DNS zone for the VPC.
   */
  readonly dnsZone: IPrivateHostedZone;

  /**
   * Our self-signed root CA certificate for the internal endpoints in the farm.
   */
  readonly rootCa: X509CertificatePem;

  /**
   * Version of Deadline to use.
   * @default The latest available release of Deadline is used
   */
  readonly deadlineVersion?: string;
}

/**
 * The service tier contains all "business-logic" constructs (e.g. Repository, Render Queue, etc.).
 */
export class ServiceTier extends Stack {
  /**
   * A bastion host to connect to the render farm with.
   */
  public readonly bastion: BastionHostLinux;

  /**
   * The render queue.
   */
  public readonly renderQueue: RenderQueue;

  /**
   * The version of Deadline configured by the app.
   */
  public readonly version: VersionQuery;

  /**
   * Initializes a new instance of {@link ServiceTier}.
   */
  constructor(scope: Construct, id: string, props: ServiceTierProps) {
    super(scope, id, props);

    // Bastion instance for convenience (e.g. SSH into RenderQueue and WorkerFleet instances).
    // It is being deployed into the standard availability zones, but has access to the worker
    // instances that get deployed into a local zone. Not a critical component of the farm, so
    // this can be safely removed.
    this.bastion = new BastionHostLinux(this, 'Bastion', {
      vpc: props.vpc,
      subnetSelection: {
        availabilityZones: props.availabilityZones,
        subnetType: SubnetType.PUBLIC,
      },
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(50, {
          encrypted: true,
        })},
      ]
    });

    this.version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    // We are excluding the local zones from the Repository. This construct will create an
    // EFS filesystem and DocDB cluster, both of which aren't available in any local zones at this time.
    const repositorySubnets: SubnetSelection = {
      availabilityZones: [ props.availabilityZones[0] ],
      subnetType: SubnetType.PRIVATE,
    };
    const repository = new Repository(this, 'Repository', {
      vpc: props.vpc,
      version: this.version,
      removalPolicy: {
        database: RemovalPolicy.DESTROY,
        filesystem: RemovalPolicy.DESTROY,
      },
      repositoryInstallationTimeout: Duration.minutes(20),
      vpcSubnets: repositorySubnets,
    });

    const images = new ThinkboxDockerImages(this, 'Images', {
      version: this.version,
      userAwsThinkboxEulaAcceptance: props.acceptAwsThinkboxEula,
    });

    const serverCert = new X509CertificatePem(this, 'RQCert', {
      subject: {
        cn: `renderqueue.${props.dnsZone.zoneName}`,
        o: 'RFDK-Sample',
        ou: 'RenderQueueExternal',
      },
      signingCertificate: props.rootCa,
    });

    // The render queue is also put only in the standard availability zones. The service itself
    // is run in a single zone, while the load balancer that sits in front of it can be provided
    // all the standard zones we're using.
    const renderQueueSubnets: SubnetSelection = {
      availabilityZones: [ props.availabilityZones[0] ],
      subnetType: SubnetType.PRIVATE,
    };
    const renderQueueAlbSubnets: SubnetSelection = {
      availabilityZones: props.availabilityZones,
      subnetType: SubnetType.PRIVATE,
      onePerAz: true,
    };
    this.renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc: props.vpc,
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
      vpcSubnets: renderQueueSubnets,
      vpcSubnetsAlb: renderQueueAlbSubnets,
      deletionProtection: false,
    });
    this.renderQueue.connections.allowDefaultPortFrom(this.bastion);
  }
}
