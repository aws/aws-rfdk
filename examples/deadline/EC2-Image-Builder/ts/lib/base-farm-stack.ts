/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  RemovalPolicy,
  Stack,
  StackProps
} from '@aws-cdk/core';
import {
  AwsThinkboxEulaAcceptance,
  RenderQueue,
  Repository,
  ThinkboxDockerImages,
  VersionQuery
} from 'aws-rfdk/deadline';

export interface FarmProps extends StackProps {
  /**
   * Whether the AWS Thinkbox End-User License Agreement is accepted or not
   */
  readonly acceptAwsThinkboxEula: AwsThinkboxEulaAcceptance;

  /**
   * Version of Deadline to use.
   */
  readonly deadlineVersion: string;
}

/**
 * This stack includes all the basic setup required for a render farm. It excludes the worker fleet.
 */
export class BaseFarmStack extends Stack {
  public readonly renderQueue: RenderQueue;
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: FarmProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });

    const version = new VersionQuery(this, 'Version', {
      version: props.deadlineVersion,
    });

    const images = new ThinkboxDockerImages(this, 'Images', {
      version: version,
      userAwsThinkboxEulaAcceptance: props.acceptAwsThinkboxEula,
    });

    const repository = new Repository(this, 'Repository', {
      vpc: this.vpc,
      removalPolicy: {
        database: RemovalPolicy.DESTROY,
        filesystem: RemovalPolicy.DESTROY,
      },
      version,
    });

    this.renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc: this.vpc,
      version,
      images,
      repository,
      deletionProtection: false,
    });
  }
}
