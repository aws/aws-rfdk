/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets';
import { ContainerImage } from '@aws-cdk/aws-ecs';
import { Construct } from '@aws-cdk/core';

import {
  IVersion,
  RenderQueueImages,
  Stage,
  UBLLicensingImages,
} from '.';

/**
 * An enum that is associated with AWS Thinkbox managed recipes that are available in the stage manifest.
 */
enum ThinkboxManagedDeadlineDockerRecipes {
  /**
   * The Docker Image Asset for the Remote Connection Server.
   */
  RemoteConnectionServer = 'rcs',

  /**
   * The Docker Image Asset for the License Forwarder.
   */
  LicenseForwarder = 'license-forwarder',
}

/**
 * Interface to specify the properties when instantiating a {@link ThinkboxDockerRecipes} instnace.
 */
export interface ThinkboxDockerRecipesProps {
  /**
   * The place where Deadline is staged.
   */
  readonly stage: Stage;
}

/**
 * An API for interacting with staged Deadline Docker recipes provided by AWS Thinkbox.
 *
 * This provides container images as required by RFDK's Deadline constructs such as
 *
 * * {@link @aws-rfdk/deadline#RenderQueue}
 * * {@link @aws-rfdk/deadline#UBLLicensing}
 *
 * @example Construct a RenderQueue
 *
 * import { App, Stack, Vpc } from '@aws-rfdk/core';
 * import { RenderQueue, Repository, ThinkboxDockerRecipes } from '@aws-rfdk/deadline';
 * const app = new App();
 * const stack = new Stack(app, 'Stack');
 * const vpc = new Vpc(app, stack);
 * const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
 *   path: '/path/to/staged/recipes'
 * });
 * const repository = new Repository(stack, 'Repository', {
 *   vpc,
 *   version: recipes.version
 * });
 *
 * const renderQueue = new RenderQueue(stack, 'RenderQueue', {
 *   images: recipes.renderQueueImages,
 *   // ...
 * });
 */
export class ThinkboxDockerRecipes extends Construct {
  /**
   * A {@link DockerImageAsset} that can be used to build Thinkbox's Deadline RCS Docker Recipe into a
   * container image that can be deployed in CDK.
   *
   * @param scope The parent scope
   * @param id The construct ID
   */
  public readonly remoteConnectionServer: DockerImageAsset;

  /**
   * A {@link DockerImageAsset} that can be used to build Thinkbox's Deadline License Forwarder Docker Recipe into a
   * container image that can be deployed in CDK.
   *
   * @param scope The parent scope
   * @param id The construct ID
   */
  public readonly licenseForwarder: DockerImageAsset;

  /**
   * Docker images staged locally for use with the {@link RenderQueue} construct.
   */
  public readonly renderQueueImages: RenderQueueImages;

  /**
   * Docker images staged locally for use with the {@link UBLLicensing} construct.
   */
  public readonly ublLicensingImages: UBLLicensingImages;

  /**
   * The version of Deadline in the stage directory.
   */
  public readonly version: IVersion;

  constructor(scope: Construct, id: string, props: ThinkboxDockerRecipesProps) {
    super(scope, id);

    this.version  = props.stage.getVersion(this, 'Version');

    for (const recipe of [ThinkboxManagedDeadlineDockerRecipes.RemoteConnectionServer, ThinkboxManagedDeadlineDockerRecipes.LicenseForwarder]) {
      if (!props.stage.manifest.recipes[recipe]) {
        throw new Error(`Could not find ${recipe} recipe`);
      }
    }

    this.remoteConnectionServer = props.stage.imageFromRecipe(
      this,
      'RemoteConnectionServer',
      ThinkboxManagedDeadlineDockerRecipes.RemoteConnectionServer.toString(),
    );

    this.licenseForwarder = props.stage.imageFromRecipe(
      this,
      'LicenseForwarder',
      ThinkboxManagedDeadlineDockerRecipes.LicenseForwarder.toString(),
    );

    this.renderQueueImages = {
      remoteConnectionServer: ContainerImage.fromDockerImageAsset(this.remoteConnectionServer),
    };

    this.ublLicensingImages = {
      licenseForwarder: ContainerImage.fromDockerImageAsset(this.licenseForwarder),
    };
  }
}