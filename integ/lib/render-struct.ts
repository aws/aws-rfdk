/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vpc } from '@aws-cdk/aws-ec2';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import { Construct, Stack } from '@aws-cdk/core';
import { X509CertificatePem } from 'aws-rfdk';
import {
  IRepository,
  RenderQueue,
  RenderQueueProps,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';
import { ThinkboxDockerImageOverrides } from './ThinkboxDockerImageOverrides';

const DOCKER_IMAGE_OVERRIDES_ENV_VAR = 'RFDK_DOCKER_IMAGE_OVERRIDES';

export interface RenderStructProps {
  readonly integStackTag: string;
  readonly repository: IRepository;
  readonly protocol: string;
  readonly recipes: ThinkboxDockerRecipes;
}

export class RenderStruct extends Construct {
  public readonly renderQueue: RenderQueue;
  public readonly cert: X509CertificatePem | undefined;

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
    const zoneName = Stack.of(this).stackName.slice(0, 45) + '.local';

    let trafficEncryption: any;
    let hostname: any;
    let cacert: any;

    // If configured for HTTPS, the render queue requires a private domain and a signed certificate for authentication
    if( props.protocol === 'https' ){
      cacert = new X509CertificatePem(this, 'CaCert' + props.integStackTag, {
        subject: {
          cn: 'ca.renderfarm.local',
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
          internalProtocol: ApplicationProtocol.HTTP,
        },
      };
      hostname = {
        zone: new PrivateHostedZone(this, 'Zone', {
          vpc,
          zoneName: zoneName,
        }),
        hostname: 'renderqueue',
      };
    }
    else {
      trafficEncryption = undefined;
      hostname = undefined;
    }

    //Create the Render Queue
    const renderQueueProps: RenderQueueProps = {
      vpc,
      repository: props.repository,
      images: dockerImageOverrides?.renderQueueImages ?? props.recipes.renderQueueImages,
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      hostname,
      version: props.recipes.version,
      trafficEncryption,
      deletionProtection: false,
    };
    this.renderQueue = new RenderQueue(this, 'RenderQueue', renderQueueProps);

    this.cert = cacert;

  }
}
