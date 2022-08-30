/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import {
  RenderQueueImages,
  ThinkboxManagedDeadlineDockerRecipes as Recipes,
  UsageBasedLicensingImages,
} from 'aws-rfdk/deadline';
import { Construct } from 'constructs';

type DeadlineDockerImageOverrides = {[key in Recipes]?: string};

/**
 * Interface for Docker image overrides stored in an ECR repository.
 */
interface IECRImageOverrides {
  /**
   * The ARN of the ECR repository.
   */
  readonly repositoryArn: string;
  /**
   * A mapping of Deadline Docker recipe names (see ThinkboxManagedDeadlineDockerRecipes in aws-rfdk) to tags of the override Docker images
   */
  readonly imageOverrides: DeadlineDockerImageOverrides;
}

/**
 * Implementation of {@link IECRImageOverrides}.
 */
class ECRImageOverrides implements IECRImageOverrides {
  /**
   * Creates an {@link ECRImageOverrides} from a JSON string.
   * @param json The JSON string.
   */
  public static fromJSON(json: string): ECRImageOverrides {
    const obj = JSON.parse(json);

    // Validate the input JSON
    const errors = [];
    [
      'repositoryArn',
      'imageOverrides',
    ].forEach(prop => {
      if (!(prop in obj)) {
        errors.push(`Property ${prop} was expected but not found in ${obj}`);
      }
    });
    if (!(obj.imageOverrides instanceof Object)) {
      errors.push(`Expected Object for imageOverrides but found ${typeof(obj.imageOverrides)}`);
    }
    Object.keys(obj.imageOverrides).forEach(key => {
      if (!Object.values(Recipes).includes(key as Recipes)) {
        errors.push(`Key ${key} in imageOverrides is invalid. Must be in: [${Object.values(Recipes)}].`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Invalid JSON for ECRImageOverrides: ${errors.join('\n')}`);
    }

    return obj as ECRImageOverrides;
  }

  /**
   * @inheritdoc
   */
  public readonly repositoryArn: string;
  /**
   * @inheritdoc
   */
  public readonly imageOverrides: DeadlineDockerImageOverrides;

  constructor(props: {repositoryArn: string, imageOverrides: DeadlineDockerImageOverrides}) {
    this.repositoryArn = props.repositoryArn;
    this.imageOverrides = props.imageOverrides;
  }
}

/**
 * Properties for {@link ThinkboxDockerImageOverrides}.
 */
export interface ThinkboxDockerImageOverridesProps {
  /**
   * The {@link RenderQueueImages} override.
   */
  readonly renderQueueImages?: RenderQueueImages;
  /**
   * The {@link UsageBasedLicensingImages} override.
   */
  readonly ublImages?: UsageBasedLicensingImages;
}

/**
 * Contains overrides for Thinkbox Docker images used in the RFDK.
 */
export class ThinkboxDockerImageOverrides {
  /**
   * Creates a {@link ThinkboxDockerImageOverrides} from a JSON string. The JSON string must contain the fields in {@link IECRImageOverrides}.
   */
  public static fromJSON(scope: Construct, id: string, json: string): ThinkboxDockerImageOverrides {
    const overrides: IECRImageOverrides = ECRImageOverrides.fromJSON(json);
    const repository = Repository.fromRepositoryArn(scope, `${id}Repository`, overrides.repositoryArn);

    return new ThinkboxDockerImageOverrides({
      renderQueueImages: Recipes.REMOTE_CONNECTION_SERVER in overrides.imageOverrides ?
        {
          remoteConnectionServer: ContainerImage.fromEcrRepository(repository, overrides.imageOverrides[Recipes.REMOTE_CONNECTION_SERVER]),
        } : undefined,
      ublImages: Recipes.LICENSE_FORWARDER in overrides.imageOverrides ?
        {
          licenseForwarder: ContainerImage.fromEcrRepository(repository, overrides.imageOverrides[Recipes.LICENSE_FORWARDER]),
        } : undefined,
    });
  }

  /**
   * The {@link RenderQueueImages} override.
   */
  public readonly renderQueueImages?: RenderQueueImages;

  /**
   * The {@link UsageBasedLicensingImages} override.
   */
  public readonly ublImages?: UsageBasedLicensingImages;

  constructor(props: ThinkboxDockerImageOverridesProps) {
    this.renderQueueImages = props.renderQueueImages;
    this.ublImages = props.ublImages;
  }
}
