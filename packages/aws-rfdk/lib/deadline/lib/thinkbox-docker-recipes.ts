/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

import {
  Installer,
  IVersion,
  RenderQueueImages,
  Stage,
  UsageBasedLicensingImages,
  Version,
} from '.';

/**
 * An enum that is associated with AWS Thinkbox managed recipes that are available in the stage manifest.
 */
export enum ThinkboxManagedDeadlineDockerRecipes {
  /**
   * The Docker Image Asset for the Remote Connection Server.
   */
  REMOTE_CONNECTION_SERVER = 'rcs',

  /**
   * The Docker Image Asset for the License Forwarder.
   */
  LICENSE_FORWARDER = 'license-forwarder',
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
 * * {@link @aws-rfdk/deadline#UsageBasedLicensing}
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
   * Docker images staged locally for use with the {@link UsageBasedLicensing} construct.
   */
  public readonly ublImages: UsageBasedLicensingImages;

  /**
   * The staged recipes
   */
  private readonly stage: Stage;

  /**
   * The version of Deadline in the stage directory.
   */
  private versionInstance?: IVersion;

  constructor(scope: Construct, id: string, props: ThinkboxDockerRecipesProps) {
    super(scope, id);

    this.stage = props.stage;
    for (const recipe of [ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER, ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER]) {
      if (!props.stage.manifest.recipes[recipe]) {
        throw new Error(`Could not find ${recipe} recipe`);
      }
    }

    this.remoteConnectionServer = props.stage.imageFromRecipe(
      this,
      'RemoteConnectionServer',
      ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER.toString(),
    );

    this.licenseForwarder = props.stage.imageFromRecipe(
      this,
      'LicenseForwarder',
      ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER.toString(),
    );

    this.renderQueueImages = {
      remoteConnectionServer: ContainerImage.fromDockerImageAsset(this.remoteConnectionServer),
    };

    this.ublImages = {
      licenseForwarder: ContainerImage.fromDockerImageAsset(this.licenseForwarder),
    };
  }

  public get version(): IVersion {
    if (!this.versionInstance) {
      const version = Version.parse(this.stage.manifest.version);

      const self = this;

      this.versionInstance = {
        isLessThan: (other) => version.isLessThan(other),
        linuxFullVersionString: () => this.stage.manifest.version,
        linuxInstallers: {
          get client(): Installer {
            let assetNode = self.node.tryFindChild('ClientInstallerAsset');
            let asset: Asset;
            /* istanbul ignore else */
            if (!assetNode) {
              asset = new Asset(self, 'ClientInstallerAsset', {
                path: self.stage.clientInstallerPath,
              });
            } else if (assetNode instanceof Asset) {
              asset = assetNode as Asset;
            } else {
              throw new Error(`Node "${assetNode?.node.path}" is not an S3 Asset`);
            }
            return {
              objectKey: asset.s3ObjectKey,
              s3Bucket: asset.bucket,
            };
          },
          repository: this.stage.getVersion(this, 'VersionQuery').linuxInstallers.repository,
          patchVersion: version.patchVersion,
        },
        majorVersion: version.majorVersion,
        minorVersion: version.minorVersion,
        releaseVersion: version.releaseVersion,
        versionString: version.versionString,
      };
    }

    return this.versionInstance;
  }
}
