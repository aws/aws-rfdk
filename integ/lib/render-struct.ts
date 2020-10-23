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
  IVersion,
  RenderQueue,
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';

export interface RenderStructProps {
  readonly integStackTag: string;
  readonly repository: IRepository;
  readonly protocol: string;
  readonly version: IVersion
}

export class RenderStruct extends Construct {
  public readonly renderQueue: RenderQueue;
  public readonly cert: X509CertificatePem | undefined;

  constructor(scope: Construct, id: string, props: RenderStructProps) {
    super(scope, id);

    // Collect environment variables
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();

    // Retrieve VPC created for _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    // Stage docker recipes, which include image used for the render queue instance
    const recipes = new ThinkboxDockerRecipes(this, 'DockerRecipes', {
      stage: Stage.fromDirectory(stagePath),
    });

    const host = 'renderqueue';
    const zoneName = Stack.of(this).stackName + '.local';

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
    var renderQueueProps = {
      vpc,
      repository: props.repository,
      images: recipes.renderQueueImages,
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      hostname,
      version: props.version,
      trafficEncryption,
      deletionProtection: false,
    };
    this.renderQueue = new RenderQueue(this, 'RenderQueue', renderQueueProps);

    this.cert = cacert;

  }
}
