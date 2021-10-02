/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vpc } from '@aws-cdk/aws-ec2';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { Construct, Stack } from '@aws-cdk/core';
import { X509CertificatePem } from 'aws-rfdk';
import {
  IRepository,
  RenderQueue,
  RenderQueueHostNameProps,
  RenderQueueTrafficEncryptionProps,
  ThinkboxDockerRecipes,
  UsageBasedLicense,
  UsageBasedLicensing,
} from 'aws-rfdk/deadline';
import { NetworkTier } from '../components/_infrastructure/lib/network-tier';
import { ThinkboxDockerImageOverrides } from './thinkbox-docker-image-overrides';

const DOCKER_IMAGE_OVERRIDES_ENV_VAR = 'RFDK_DOCKER_IMAGE_OVERRIDES';

export interface RenderStructUsageBasedLicensingProps {
  readonly certificateBundleSecretArn: string;
  readonly licenses: UsageBasedLicense[];
}

export interface RenderStructProps {
  readonly integStackTag: string;
  readonly repository: IRepository;
  readonly protocol: string;
  readonly recipes: ThinkboxDockerRecipes;
  readonly ubl?: RenderStructUsageBasedLicensingProps;
}

export class RenderStruct extends Construct {
  public readonly renderQueue: RenderQueue;
  public readonly cert: X509CertificatePem | undefined;
  public readonly ubl?: UsageBasedLicensing;

  constructor(scope: Construct, id: string, props: RenderStructProps) {
    super(scope, id);

    // Collect environment variables
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;

    // Retrieve VPC created for _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    // Retrieve Docker image overrides, if available
    let dockerImageOverrides: (ThinkboxDockerImageOverrides | undefined) = undefined;
    if (process.env[DOCKER_IMAGE_OVERRIDES_ENV_VAR] !== undefined) {
      dockerImageOverrides = ThinkboxDockerImageOverrides.fromJSON(this, 'ThinkboxDockerImageOverrides', process.env[DOCKER_IMAGE_OVERRIDES_ENV_VAR]!.toString());
    }

    const host = 'renderqueue';
    const suffix = '.local';
    // We are calculating the max length we can add to the common name to keep it under the maximum allowed 64
    // characters and then taking a slice of the stack name so we don't get an error when creating the certificate
    // with openssl
    const maxLength = 64 - host.length - '.'.length - suffix.length - 1;
    const zoneName = Stack.of(this).stackName.slice(0, maxLength) + suffix;

    let trafficEncryption: RenderQueueTrafficEncryptionProps | undefined;
    let hostname: RenderQueueHostNameProps | undefined;
    let cacert: X509CertificatePem | undefined;

    // If configured for HTTPS, the render queue requires a private domain and a signed certificate for authentication
    if( props.protocol === 'https' ) {
      cacert = new X509CertificatePem(this, 'CaCert' + props.integStackTag, {
        subject: {
          cn: 'ca.renderfarm' + suffix,
        },
      });

      trafficEncryption = {
        externalTLS: {
          rfdkCertificate: new X509CertificatePem(this, 'RenderQueueCertPEM' + props.integStackTag, {
            subject: {
              cn: host + '.' + zoneName,
            },
            signingCertificate: cacert,
          }),
        },
        internalProtocol: ApplicationProtocol.HTTPS,
      };
      hostname = {
        zone: new PrivateHostedZone(this, 'Zone', {
          vpc,
          zoneName: zoneName,
        }),
        hostname: host,
      };
    } else {
      trafficEncryption = { externalTLS: { enabled: false } };
      hostname = undefined;
    }

    //Create the Render Queue
    this.renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc,
      vpcSubnetsAlb: vpc.selectSubnets({ subnetGroupName: NetworkTier.subnetConfig.renderQueueAlb.name }),
      repository: props.repository,
      images: dockerImageOverrides?.renderQueueImages ?? props.recipes.renderQueueImages,
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      hostname,
      version: props.recipes.version,
      trafficEncryption,
      deletionProtection: false,
    });

    this.cert = cacert;

    if (props.ubl) {
      const ublCertificates = Secret.fromSecretCompleteArn(this, 'UsageBasedLicensingCertificates', props.ubl.certificateBundleSecretArn);
      this.ubl = new UsageBasedLicensing(this, 'UsageBasedLicensing', {
        vpc,
        vpcSubnets: vpc.selectSubnets({ subnetGroupName: NetworkTier.subnetConfig.ubl.name }),
        renderQueue: this.renderQueue,
        images: dockerImageOverrides?.ublImages ?? props.recipes.ublImages,
        licenses: props.ubl.licenses,
        certificateSecret: ublCertificates,
      });
    }
  }
}
