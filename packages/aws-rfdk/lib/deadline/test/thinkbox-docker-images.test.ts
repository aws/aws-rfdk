/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  expect as expectCDK,
  haveResource,
  objectLike,
  stringLike,
  SynthUtils,
} from '@aws-cdk/assert';
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
  AwsThinkboxEulaAcceptance,
  IVersion,
  RenderQueueImages,
  ThinkboxDockerImages,
  ThinkboxManagedDeadlineDockerRecipes,
  UsageBasedLicensingImages,
  VersionQuery,
} from '../lib';

describe('ThinkboxDockerRecipes', () => {
  let app: App;
  let stack: Stack;
  let images: ThinkboxDockerImages;
  let userAwsThinkboxEulaAcceptance: AwsThinkboxEulaAcceptance;

  describe('defaults', () => {
    beforeEach(() => {
      // GIVEN
      app = new App();
      stack = new Stack(app, 'Stack');
      userAwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA;

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {
        userAwsThinkboxEulaAcceptance,
      });
    });

    test('fails validation when EULA is not accepted', () =>{
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      const expectedError = `
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
      userAwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA;
      new ThinkboxDockerImages(newStack, 'Images', {
        userAwsThinkboxEulaAcceptance,
      });

      // WHEN
      function synth() {
        SynthUtils.synthesize(newStack);
      }

      // THEN
      expect(synth).toThrow(expectedError);
    });

    test('creates Custom::RFDK_ECR_PROVIDER', () => {
      // THEN
      expectCDK(stack).to(haveResource('Custom::RFDK_EcrProvider', {
        ForceRun: stringLike('*'),
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
      stack = new Stack(app, 'Stack');
      version = new VersionQuery(stack, 'Version');

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {
        version,
        userAwsThinkboxEulaAcceptance,
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

    test('validates VersionQuery is not in a different stack', () => {
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      new ThinkboxDockerImages(newStack, 'Images', {
        version,
        userAwsThinkboxEulaAcceptance,
      });

      // WHEN
      function synth() {
        SynthUtils.synthesize(newStack);
      }

      // THEN
      expect(synth).toThrow('A VersionQuery can not be supplied from a different stack');
    });
  });
});
