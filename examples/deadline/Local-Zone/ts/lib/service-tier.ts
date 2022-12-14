/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IVpc,
  SubnetSelection,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  IPrivateHostedZone,
} from 'aws-cdk-lib/aws-route53';
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import {
  SessionManagerHelper,
  X509CertificatePem,
} from 'aws-rfdk';
import {
  AwsCustomerAgreementAndIpLicenseAcceptance,
  RenderQueue,
  Repository,
  ThinkboxDockerImages,
  VersionQuery,
} from 'aws-rfdk/deadline';
import { Construct } from 'constructs';

/**
 * Properties for {@link ServiceTier}.
 */
export interface ServiceTierProps extends StackProps {
  /**
   * The VPC to deploy service tier resources into.
   */
  readonly vpc: IVpc;

  /**
   * Whether the AWS Customer Agreement and AWS Intellectual Property License are agreed to.
   */
  readonly userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;

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

    this.version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    // We are excluding the local zones from the Repository. This construct will create an
    // EFS filesystem and DocDB cluster, both of which aren't available in any local zones at this time.
    const repositorySubnets: SubnetSelection = {
      availabilityZones: props.availabilityZones,
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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

    // The render queue is also put only in the standard availability zones. The service itself
    // is run in a single zone, while the load balancer that sits in front of it can be provided
    // all the standard zones we're using.
    const renderQueueSubnets: SubnetSelection = {
      availabilityZones: [ props.availabilityZones[0] ],
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    };
    const renderQueueAlbSubnets: SubnetSelection = {
      availabilityZones: props.availabilityZones,
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
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
    SessionManagerHelper.grantPermissionsTo(this.renderQueue.asg);
  }
}
