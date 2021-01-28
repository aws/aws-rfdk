/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
import * as path from 'path';

import {
  ContainerImage,
  RepositoryImage,
} from '@aws-cdk/aws-ecs';
import {
  Code,
  SingletonFunction,
  Runtime,
} from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import {
  Construct,
  CustomResource,
  Duration,
  Token,
} from '@aws-cdk/core';

import {
  IVersion,
  RenderQueueImages,
  ThinkboxManagedDeadlineDockerRecipes,
  UsageBasedLicensingImages,
} from '.';

/**
 * Choices for signifying the user's stance on the terms of the AWS Thinkbox End-User License Agreement (EULA).
 * See: https://www.awsthinkbox.com/end-user-license-agreement
 */
export enum AwsThinkboxEulaAcceptance {
  /**
   * The user signifies their explicit rejection of the tems of the AWS Thinkbox EULA.
   *
   * See: https://www.awsthinkbox.com/end-user-license-agreement
   */
  USER_REJECTS_AWS_THINKBOX_EULA = 0,

  /**
   * The user signifies their explicit acceptance of the terms of the AWS Thinkbox EULA.
   *
   * See: https://www.awsthinkbox.com/end-user-license-agreement
   */
  USER_ACCEPTS_AWS_THINKBOX_EULA = 1,
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
   * Deadline is licensed under the terms of the AWS Thinkbox End-User License Agreement (see: https://www.awsthinkbox.com/end-user-license-agreement).
   * Users of ThinkboxDockerImages must explicitly signify their acceptance of the terms of the AWS Thinkbox EULA through this
   * property before the {@link ThinkboxDockerImages} will be allowed to deploy Deadline.
   */
  // Developer note: It is a legal requirement that the default be USER_REJECTS_AWS_THINKBOX_EULA.
  readonly userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance;
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
 * import { AwsThinkboxEulaAcceptance, RenderQueue, Repository, ThinkboxDockerImages, VersionQuery } from '@aws-rfdk/deadline';
 * const app = new App();
 * const stack = new Stack(app, 'Stack');
 * const vpc = new Vpc(stack, 'Vpc');
 * const version = new VersionQuery(stack, 'Version', {
 *   version: '10.1.12',
 * });
 * const images = new ThinkboxDockerImages(stack, 'Image', {
 *   version,
 *   // Change this to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA to accept the terms
 *   // of the AWS Thinkbox End User License Agreement
 *   userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA,
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
   * The AWS Thinkbox licensing message that is presented to the user if they create an instance of
   * this class without explicitly accepting the AWS Thinkbox EULA.
   *
   * Note to developers: The text of this string is a legal requirement, and must not be altered
   * witout approval.
   */
  private static readonly AWS_THINKBOX_EULA_MESSAGE: string = `
The ThinkboxDockerImages will install Deadline onto one or more EC2 instances.

Deadline is provided by AWS Thinkbox under the AWS Thinkbox End User License
Agreement (EULA). By installing Deadline, you are agreeing to the terms of this
license. Follow the link below to read the terms of the AWS Thinkbox EULA.

https://www.awsthinkbox.com/end-user-license-agreement

By using the ThinkboxDockerImages to install Deadline you agree to the terms of
the AWS Thinkbox EULA.

Please set the userAwsThinkboxEulaAcceptance property to
USER_ACCEPTS_AWS_THINKBOX_EULA to signify your acceptance of the terms of the
AWS Thinkbox EULA.
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
   * Whether the user has accepted the AWS Thinkbox EULA
   */
  private readonly userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance;

  constructor(scope: Construct, id: string, props: ThinkboxDockerImagesProps) {
    super(scope, id);

    this.userAwsThinkboxEulaAcceptance = props.userAwsThinkboxEulaAcceptance;
    this.version = props?.version;

    const lambdaCode = Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'));

    const lambdaFunc = new SingletonFunction(this, 'VersionProviderFunction', {
      uuid: '08553416-1fc9-4be9-a818-609a31ae1b5b',
      description: 'Used by the ThinkboxDockerImages construct to look up the ECR repositories where AWS Thinkbox publishes Deadline container images.',
      code: lambdaCode,
      runtime: Runtime.NODEJS_12_X,
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
  }

  protected onValidate() {
    const errors: string[] = [];

    // Users must accept the AWS Thinkbox EULA to use the container images
    if (this.userAwsThinkboxEulaAcceptance !== AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA) {
      errors.push(ThinkboxDockerImages.AWS_THINKBOX_EULA_MESSAGE);
    }

    return errors;
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
    return this;
  }

  /**
   * Returns container images for use with the {@link UsageBasedLicensing} construct
   */
  public forUsageBasedLicensing(): UsageBasedLicensingImages {
    return this;
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
