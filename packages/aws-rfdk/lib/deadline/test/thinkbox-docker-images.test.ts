/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CustomResource,
  Stack,
  Token,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  Compatibility,
  ContainerDefinition,
  ContainerImage,
  TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';

import {
  AwsCustomerAgreementAndIpLicenseAcceptance,
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
  let userAwsCustomerAgreementAndIpLicenseAcceptance: AwsCustomerAgreementAndIpLicenseAcceptance;

  describe('defaults', () => {
    beforeEach(() => {
      // GIVEN
      app = new App();
      stack = new Stack(app, 'Stack');
      userAwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE;

      // WHEN
      images = new ThinkboxDockerImages(stack, 'Images', {
        userAwsCustomerAgreementAndIpLicenseAcceptance,
      });
    });

    test('fails validation when terms are not accepted', () =>{
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      const expectedError = `
The ThinkboxDockerImages will install Deadline onto one or more EC2 instances.

By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
is AWS Content as defined in those Agreements.

Please set the userAwsCustomerAgreementAndIpLicenseAcceptance property to
USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE to signify your acceptance of these terms.
`;
      userAwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE;
      new ThinkboxDockerImages(newStack, 'Images', {
        userAwsCustomerAgreementAndIpLicenseAcceptance,
      });

      // WHEN
      function synth() {
        app.synth();
      }

      // THEN
      expect(synth).toThrow(expectedError);
    });

    test('creates Custom::RFDK_ECR_PROVIDER', () => {
      // THEN
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_EcrProvider', {
        ForceRun: Match.anyValue(),
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
        const expectedImage = `${ecrProvider.getAtt('EcrURIPrefix')}${recipe}`;

        // WHEN
        new ContainerDefinition(taskDefStack, 'ContainerDef', {
          image,
          taskDefinition,
          memoryReservationMiB: 1024,
        });

        // THEN
        Template.fromStack(taskDefStack).hasResourceProperties('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: Match.arrayWith([Match.objectLike({
            Image: taskDefStack.resolve(expectedImage),
          })]),
        });
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
        userAwsCustomerAgreementAndIpLicenseAcceptance,
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
        Template.fromStack(taskDefStack).hasResourceProperties('AWS::ECS::TaskDefinition', {
          ContainerDefinitions: Match.arrayWith([Match.objectLike({
            Image: taskDefStack.resolve(expectedImage),
          })]),
        });
      });
    });

    test('validates VersionQuery is not in a different stack', () => {
      // GIVEN
      const newStack = new Stack(app, 'NewStack');
      new ThinkboxDockerImages(newStack, 'Images', {
        version,
        userAwsCustomerAgreementAndIpLicenseAcceptance,
      });

      // WHEN
      function synth() {
        app.synth();
      }

      // THEN
      expect(synth).toThrow('A VersionQuery can not be supplied from a different stack');
    });
  });
});
