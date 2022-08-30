/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  RemovalPolicy,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import {
  AwsCustomerAgreementAndIpLicenseAcceptance,
  RenderQueue,
  Repository,
  ThinkboxDockerImages,
  VersionQuery
} from 'aws-rfdk/deadline';
import { Construct } from 'constructs';

export interface FarmProps extends StackProps {
  /**
   * Whether the AWS Customer Agreement and AWS Intellectual Property License are agreed to.
   */
  readonly userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;

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
      userAwsCustomerAgreementAndIpLicenseAcceptance: props.userAwsCustomerAgreementAndIpLicenseAcceptance,
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
