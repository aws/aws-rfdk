/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ABSENT,
  arrayWith,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  objectLike,
  stringLike,
} from '@aws-cdk/assert';
import {
  Repository,
} from '@aws-cdk/aws-ecr';
import {
  Compatibility,
  ContainerDefinition,
  ContainerImage,
  TaskDefinition,
} from '@aws-cdk/aws-ecs';
import {
  App,
  CustomResource,
  Stack,
  Token,
} from '@aws-cdk/core';

import {
  IVersion,
  RenderQueueImages,
  ThinkboxDockerImages,
  ThinkboxManagedDeadlineDockerRecipes,
  UsageBasedLicensingImages,
  VersionQuery,
} from '../lib';

describe('ThinkboxDockerRecipes', () => {
  let app: App;
  let depStack: Stack;
  let stack: Stack;
  let images: ThinkboxDockerImages;

  describe('defaults', () => {
    beforeEach(() => {
      // GIVEN
      app = new App();
      stack = new Stack(app, 'Stack');

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {});
    });

    test('creates Custom::RFDK_ECR_PROVIDER', () => {
      // THEN
      expectCDK(stack).to(haveResource('Custom::RFDK-EcrProvider', {
        ForceRun: stringLike('*'),
        Region: ABSENT,
      }));
    });

    describe('provides container images for', () => {
      test.each<[string, () => ContainerImage, ThinkboxManagedDeadlineDockerRecipes]>([
        [
          'RCS',
          () => {
            return images.remoteConnectionServer;
          },
          ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER,
        ],
        [
          'License Forwarder',
          () => {
            return images.licenseForwarder;
          },
          ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER,
        ],
      ])('%s', (_label, imageGetter, recipe) => {
        // GIVEN
        const taskDefStack = new Stack(app, 'TaskDefStack');
        const image = imageGetter();
        const taskDefinition = new TaskDefinition(taskDefStack, 'TaskDef', {
          compatibility: Compatibility.EC2,
        });
        const ecrProvider = images.node.defaultChild as CustomResource;
        const expectedImage = `${ecrProvider.getAtt('EcrURIPrefix')}${recipe}`;

        // WHEN
        new ContainerDefinition(taskDefStack, 'ContainerDef', {
          image,
          taskDefinition,
          memoryReservationMiB: 1024,
        });

        // THEN
        expectCDK(taskDefStack).to(haveResource('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: arrayWith(objectLike({
            Image: taskDefStack.resolve(expectedImage),
          })),
        }));
      });
    });

    describe('.forRenderQueue()', () => {
      let rcsImage: ContainerImage;
      let rqImages: RenderQueueImages;

      beforeEach(() => {
        // GIVEN
        rcsImage = images.remoteConnectionServer;

        // WHEN
        rqImages = images.forRenderQueue();
      });

      test('returns correct RCS image', () => {
        // THEN
        expect(rqImages.remoteConnectionServer).toBe(rcsImage);
      });
    });

    describe('.forUsageBasedLicensing()', () => {
      let lfImage: ContainerImage;
      let ublImages: UsageBasedLicensingImages;

      beforeEach(() => {
        // GIVEN
        lfImage = images.licenseForwarder;

        // WHEN
        ublImages = images.forUsageBasedLicensing();
      });

      test('returns correct RCS image', () => {
        // THEN
        expect(ublImages.licenseForwarder).toBe(lfImage);
      });
    });
  });

  describe('with version', () => {
    let version: IVersion;

    beforeEach(() => {
      // GIVEN
      app = new App();
      depStack = new Stack(app, 'DepStack');
      version = new VersionQuery(depStack, 'Version');
      stack = new Stack(app, 'Stack');

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {
        version,
      });
    });

    describe('provides container images for', () => {
      test.each<[string, () => ContainerImage, ThinkboxManagedDeadlineDockerRecipes]>([
        [
          'RCS',
          () => {
            return images.remoteConnectionServer;
          },
          ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER,
        ],
        [
          'License Forwarder',
          () => {
            return images.licenseForwarder;
          },
          ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER,
        ],
      ])('%s', (_label, imageGetter, recipe) => {
        // GIVEN
        const taskDefStack = new Stack(app, 'TaskDefStack');
        const image = imageGetter();
        const taskDefinition = new TaskDefinition(taskDefStack, 'TaskDef', {
          compatibility: Compatibility.EC2,
        });
        const ecrProvider = images.node.defaultChild as CustomResource;
        const expectedImage = `${ecrProvider.getAtt('EcrURIPrefix')}${recipe}:${Token.asString(version.majorVersion)}.${Token.asString(version.minorVersion)}.${Token.asString(version.releaseVersion)}`;

        // WHEN
        new ContainerDefinition(taskDefStack, 'ContainerDef', {
          image,
          taskDefinition,
          memoryReservationMiB: 1024,
        });

        // THEN
        expectCDK(taskDefStack).to(haveResource('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: arrayWith(objectLike({
            Image: taskDefStack.resolve(expectedImage),
          })),
        }));
      });
    });
  });

  describe('with region', () => {
    // GIVEN
    const region = 'us-west-2';

    beforeEach(() => {
      // GIVEN
      app = new App();
      stack = new Stack(app, 'Stack');

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {
        region,
      });
    });

    test('passes Region property', () => {
      // THEN
      expectCDK(stack).to(haveResourceLike('Custom::RFDK-EcrProvider', {
        Region: region,
      }));
    });

    describe('provides container images for', () => {
      test.each<[string, () => ContainerImage, ThinkboxManagedDeadlineDockerRecipes]>([
        [
          'RCS',
          () => {
            return images.remoteConnectionServer;
          },
          ThinkboxManagedDeadlineDockerRecipes.REMOTE_CONNECTION_SERVER,
        ],
        [
          'License Forwarder',
          () => {
            return images.licenseForwarder;
          },
          ThinkboxManagedDeadlineDockerRecipes.LICENSE_FORWARDER,
        ],
      ])('%s', (_label, imageGetter, recipe) => {
        // GIVEN
        const taskDefStack = new Stack(app, 'TaskDefStack');
        const image = imageGetter();
        const taskDefinition = new TaskDefinition(taskDefStack, 'TaskDef', {
          compatibility: Compatibility.EC2,
        });
        const ecrProvider = images.node.defaultChild as CustomResource;
        const repo = Repository.fromRepositoryAttributes(taskDefStack, 'Repo', {
          repositoryArn: `${ecrProvider.getAttString('EcrArnPrefix')}${recipe}`,
          repositoryName: `deadline/${recipe}`,
        });
        const containerImage = ContainerImage.fromEcrRepository(repo);

        // WHEN
        new ContainerDefinition(taskDefStack, 'ContainerDef', {
          image,
          taskDefinition,
          memoryReservationMiB: 1024,
        });

        // THEN
        expectCDK(taskDefStack).to(haveResource('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: arrayWith(objectLike({
            Image: taskDefStack.resolve(containerImage.imageName),
          })),
        }));
      });
    });
  });
});
