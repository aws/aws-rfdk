/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
import * as path from 'path';

import {
  CustomResource,
  Duration,
  Stack,
  Token,
} from 'aws-cdk-lib';
import {
  ContainerImage,
  RepositoryImage,
} from 'aws-cdk-lib/aws-ecs';
import {
  Code,
  SingletonFunction,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import {
  IVersion,
  RenderQueueImages,
  ThinkboxManagedDeadlineDockerRecipes,
  UsageBasedLicensingImages,
  VersionQuery,
} from '.';

/**
 * The ThinkboxDockerImages will install Deadline onto one or more EC2 instances.
 *
 * By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
 * and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
 * is AWS Content as defined in those Agreements.
 *
 * This enum is used to signify acceptance or rejection of these terms.
 */
export enum AwsCustomerAgreementAndIpLicenseAcceptance {
  /**
   * The user signifies their explicit rejection of the terms.
   */
  USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE = 0,

  /**
   * The user signifies their explicit acceptance of the terms.
   */
  USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE = 1,
}

/**
 * Interface to specify the properties when instantiating a {@link ThinkboxDockerImages} instnace.
 */
export interface ThinkboxDockerImagesProps {
  /**
   * The Deadline version to obtain images for.
   * @default latest
   */
  readonly version?: IVersion;

  /**
   * The ThinkboxDockerImages will install Deadline onto one or more EC2 instances.
   *
   * By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
   * and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
   * is AWS Content as defined in those Agreements.
   *
   * Use this property to indicate whether you accept or reject these terms.
   */
  // Developer note: It is a legal requirement that the default be USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE.
  readonly userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;
}

/**
 * An API for interacting with publicly available Deadline container images published by AWS Thinkbox.
 *
 * This provides container images as required by RFDK's Deadline constructs such as
 *
 * * {@link @aws-rfdk/deadline#RenderQueue}
 * * {@link @aws-rfdk/deadline#UsageBasedLicensing}
 *
 * Successful usage of the published Deadline container images with this class requires:
 *
 * 1) Explicit acceptance of the terms of the AWS Thinkbox End User License Agreement, under which Deadline is
 *    distributed; and
 * 2) The lambda on which the custom resource looks up the Thinkbox container images is able to make HTTPS
 *    requests to the official AWS Thinbox download site: https://downloads.thinkboxsoftware.com
 *
 * Resources Deployed
 * ------------------------
 * - A Lambda function containing a script to look up the AWS Thinkbox container image registry
 *
 * Security Considerations
 * ------------------------
 * - CDK deploys the code for this lambda as an S3 object in the CDK bootstrap bucket. You must limit write access to
 *   your CDK bootstrap bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly
 *   recommend that you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS
 *   CloudTrail on your account to assist in post-incident analysis of compromised production environments.
 *
 * For example, to construct a RenderQueue using the images:
 *
 * ```ts
 * import { App, Stack, Vpc } from '@aws-rfdk/core';
 * import { AwsCustomerAgreementAndIpLicenseAcceptance, RenderQueue, Repository, ThinkboxDockerImages, VersionQuery } from '@aws-rfdk/deadline';
 * const app = new App();
 * const stack = new Stack(app, 'Stack');
 * const vpc = new Vpc(stack, 'Vpc');
 * const version = new VersionQuery(stack, 'Version', {
 *   version: '10.1.12',
 * });
 * const images = new ThinkboxDockerImages(stack, 'Image', {
 *   version,
 *   // Change this to AwsCustomerAgreementAndIpLicenseAcceptance.USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE to accept the terms
 *   // of the AWS Customer Agreement and AWS Intellectual Property License.
 *   userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE,
 * });
 * const repository = new Repository(stack, 'Repository', {
 *   vpc,
 *   version,
 * });
 *
 * const renderQueue = new RenderQueue(stack, 'RenderQueue', {
 *   images: images.forRenderQueue(),
 *   // ...
 * });
 * ```
 */
export class ThinkboxDockerImages extends Construct {
  /**
   * The Deadline licensing message that is presented to the user if they create an instance of
   * this class without explicitly accepting the AWS Content Agreement and AWS Intellectual Property License.
   *
   * Note to developers: The text of this string is a legal requirement, and must not be altered
   * without approval.
   */
  private static readonly AWS_CONTENT_NOTICE: string = `
The ThinkboxDockerImages will install Deadline onto one or more EC2 instances.

By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
is AWS Content as defined in those Agreements.

Please set the userAwsCustomerAgreementAndIpLicenseAcceptance property to
USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE to signify your acceptance of these terms.
`;

  /**
   * A {@link DockerImageAsset} that can be used to build Thinkbox's Deadline RCS Docker Recipe into a
   * container image that can be deployed in CDK.
   *
   * @param scope The parent scope
   * @param id The construct ID
   */
  public readonly remoteConnectionServer: ContainerImage;

  /**
   * A {@link DockerImageAsset} that can be used to build Thinkbox's Deadline License Forwarder Docker Recipe into a
   * container image that can be deployed in CDK.
   *
   * @param scope The parent scope
   * @param id The construct ID
   */
  public readonly licenseForwarder: ContainerImage;

  /**
   * The version of Deadline installed in the container images
   */
  private readonly version?: IVersion;

  /**
   * The base URI for AWS Thinkbox published Deadline ECR images.
   */
  private readonly ecrBaseURI: string;

  /**
   * Whether the user has accepted the terms of the AWS Content Agreement and AWS Intellectual Property License.
   */
  private readonly userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;

  constructor(scope: Construct, id: string, props: ThinkboxDockerImagesProps) {
    super(scope, id);

    this.userAwsCustomerAgreementAndIpLicenseAcceptance = props.userAwsCustomerAgreementAndIpLicenseAcceptance;
    this.version = props?.version;

    const lambdaCode = Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'));

    const lambdaFunc = new SingletonFunction(this, 'VersionProviderFunction', {
      uuid: '08553416-1fc9-4be9-a818-609a31ae1b5b',
      description: 'Used by the ThinkboxDockerImages construct to look up the ECR repositories where AWS Thinkbox publishes Deadline container images.',
      code: lambdaCode,
      runtime: Runtime.NODEJS_16_X,
      handler: 'ecr-provider.handler',
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_WEEK,
    });

    const ecrProvider = new CustomResource(this, 'ThinkboxEcrProvider', {
      serviceToken: lambdaFunc.functionArn,
      properties: {
        // create a random string that will force the Lambda to "update" on each deployment. Changes to its output will
        // be propagated to any CloudFormation resource providers that reference the output ARN
        ForceRun: this.forceRun(),
      },
      resourceType: 'Custom::RFDK_EcrProvider',
    });

    this.node.defaultChild = ecrProvider;

    this.ecrBaseURI = ecrProvider.getAtt('EcrURIPrefix').toString();

    this.remoteConnectionServer = this.ecrImageForRecipe(ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER);
    this.licenseForwarder = this.ecrImageForRecipe(ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER);

    const thisConstruct = this;
    this.node.addValidation({
      validate(): string[] {
        const errors: string[] = [];

        // Users must accept the AWS Customer Agreement and AWS Intellectual Property License to use the container images
        if (thisConstruct.userAwsCustomerAgreementAndIpLicenseAcceptance !==
            AwsCustomerAgreementAndIpLicenseAcceptance.USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE) {
          errors.push(ThinkboxDockerImages.AWS_CONTENT_NOTICE);
        }

        // Using the output of VersionQuery across stacks can cause issues. CloudFormation stack outputs cannot change if
        // a resource in another stack is referencing it.
        if (thisConstruct.version instanceof VersionQuery) {
          const versionStack = Stack.of(thisConstruct.version);
          const thisStack = Stack.of(thisConstruct);
          if (versionStack != thisStack) {
            errors.push('A VersionQuery can not be supplied from a different stack');
          }
        }
        return errors;
      },
    });
  }

  private ecrImageForRecipe(recipe: ThinkboxManagedDeadlineDockerRecipes): RepositoryImage {
    let registryName = `${this.ecrBaseURI}${recipe}`;
    if (this.versionString) {
      registryName += `:${this.versionString}`;
    }
    return ContainerImage.fromRegistry(
      registryName,
    );
  }

  /**
   * Returns container images for use with the {@link RenderQueue} construct
   */
  public forRenderQueue(): RenderQueueImages {
    return {
      remoteConnectionServer: this.remoteConnectionServer,
    };
  }

  /**
   * Returns container images for use with the {@link UsageBasedLicensing} construct
   */
  public forUsageBasedLicensing(): UsageBasedLicensingImages {
    return {
      licenseForwarder: this.licenseForwarder,
    };
  }

  /**
   * A string representation of the Deadline version to retrieve images for.
   *
   * This can be undefined - in which case the latest available version of Deadline is used.
   */
  private get versionString(): string | undefined {
    function numAsString(num: number): string {
      return Token.isUnresolved(num) ? Token.asString(num) : num.toString();
    }

    const version = this.version;
    if (version) {
      const major = numAsString(version.majorVersion);
      const minor = numAsString(version.minorVersion);
      const release = numAsString(version.releaseVersion);

      return `${major}.${minor}.${release}`;
    }

    return undefined;
  }

  private forceRun(): string {
    return randomBytes(32).toString('base64').slice(0, 32);
  }
}
