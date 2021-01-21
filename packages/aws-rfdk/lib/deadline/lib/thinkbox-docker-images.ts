/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
import * as path from 'path';

import {
  ContainerImage,
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
 * Interface to specify the properties when instantiating a {@link ThinkboxDockerImages} instnace.
 */
export interface ThinkboxDockerImagesProps {
  /**
   * The Deadline version to obtain images for.
   * @default latest
   */
  readonly version?: IVersion;
}

/**
 * An API for interacting with staged Deadline Docker images provided by AWS Thinkbox.
 *
 * This provides container images as required by RFDK's Deadline constructs such as
 *
 * * {@link @aws-rfdk/deadline#RenderQueue}
 * * {@link @aws-rfdk/deadline#UsageBasedLicensing}
 *
 * @example Construct a RenderQueue
 *
 * import { App, Stack, Vpc } from '@aws-rfdk/core';
 * import { RenderQueue, Repository, ThinkboxDockerRecipes } from '@aws-rfdk/deadline';
 * const app = new App();
 * const stack = new Stack(app, 'Stack');
 * const vpc = new Vpc(app, stack);
 * const images = new ThinkboxDockerImages(stack, 'Image');
 * const repository = new Repository(stack, 'Repository', {
 *   vpc,
 *   version: recipes.version
 * });
 *
 * const renderQueue = new RenderQueue(stack, 'RenderQueue', {
 *   images: images.forRenderQueue(),
 *   // ...
 * });
 */
export class ThinkboxDockerImages extends Construct {
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
   * The version of Deadline in the stage directory.
   */
  public readonly version?: IVersion;

  constructor(scope: Construct, id: string, props?: ThinkboxDockerImagesProps) {
    super(scope, id);

    this.version = props?.version;

    const lambdaCode = Code.fromAsset(path.join(__dirname, '..', '..', 'lambdas', 'nodejs'));

    const lambdaFunc = new SingletonFunction(this, 'VersionProviderFunction', {
      uuid: '08553416-1fc9-4be9-a818-609a31ae1b5b',
      description: 'Used by the ThinkboxDockerImages construct to obtain the ECR repositories that contain Deadline container images.',
      code: lambdaCode,
      runtime: Runtime.NODEJS_12_X,
      handler: 'ecr-provider.handler',
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_WEEK,
    });

    const ecrProvider = new CustomResource(this, 'ThinkboxEcrProvider', {
      serviceToken: lambdaFunc.functionArn,
      properties: {
        // create a random string that will force the Lambda to always run on redeploys. Changes to its output will be
        // propagated to any CloudFormation resource providers that reference the output ARN
        ForceRun: this.forceRun(),
      },
      resourceType: 'Custom::RFDK-EcrProvider',
    });

    this.node.defaultChild = ecrProvider;

    const versionString = this.versionString(props?.version);
    const ecrBaseURI = ecrProvider.getAtt('EcrURIPrefix').toString();

    this.remoteConnectionServer = this.globalImageForRecipe(
      ecrBaseURI,
      ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER,
      versionString,
    );
    this.licenseForwarder = this.globalImageForRecipe(
      ecrBaseURI,
      ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER,
      versionString,
    );
  }

  private globalImageForRecipe(
    ecrBaseURI: string,
    recipe: ThinkboxManagedDeadlineDockerRecipes,
    version: string | undefined,
  ) {
    let registryName = `${ecrBaseURI}${recipe}`;
    if (version) {
      registryName += `:${version}`;
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

  private versionString(version?: IVersion) {
    function numAsString(num: number): string {
      return Token.isUnresolved(num) ? Token.asString(num) : num.toString();
    }

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
