/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  App,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';

import {
  DeadlineDockerRecipes,
  Manifest,
  Recipe,
  Stage,
  StageProps,
  ThinkboxDockerRecipes,
  Version,
} from '../lib';

describe('ThinkboxDockerRecipes', () => {
  let app: App;
  let stack: Stack;
  let stage: Stage;

  // GIVEN
  const STAGE_PATH = path.join(__dirname, 'assets');

  const MAJOR_VERSION = 10;
  const MINOR_VERSION = 1;
  const RELEASE_VERSION = 9;
  const PATCH_VERSION = 2;
  const RELEASE_VERSION_STRING = `${MAJOR_VERSION}.${MINOR_VERSION}.${RELEASE_VERSION}`;
  const FULL_VERSION_STRING = `${RELEASE_VERSION_STRING}.${PATCH_VERSION}`;

  const RCS_RECIPE_NAME = 'rcs';
  const RCS_RECIPE: Recipe = {
    description: 'rcs',
    title: 'rcs',
    buildArgs: {
      DL_VERSION: FULL_VERSION_STRING,
      a: 'a',
      b: 'b',
    },
    target: undefined,
  };

  const LICENSE_FORWARDER_RECIPE_NAME = 'license-forwarder';
  const LICENSE_FORWARDER_RECIPE: Recipe = {
    title: 'license-forwarder',
    description: 'license-forwarder',
    buildArgs: {
      DL_VERSION: FULL_VERSION_STRING,
      c: 'c',
      d: 'd',
    },
    target: 'lf',
  };

  beforeEach(() => {
    app = new App();

    class TestStage extends Stage {
      constructor(props: StageProps) {
        super(props);
      }
    }

    stage = new TestStage({
      path: STAGE_PATH,
      manifest: {
        schema: 1,
        version: FULL_VERSION_STRING,
        recipes: {
          [RCS_RECIPE_NAME]: RCS_RECIPE,
          [LICENSE_FORWARDER_RECIPE_NAME]: LICENSE_FORWARDER_RECIPE,
        },
      },
    });

    stack = new Stack(app, 'Stack');
  });

  /**
   * Tests that the remote connection server and license forwarder Docker recipes
   * create the correct {@link DockerImageAsset} instances using the build arguments,
   * and target from the supplied manifest.
   *
   * This is done by comparing the `assetHash` property of the expected vs actual
   * DockerImageAsset instances.
   */
  test.each<[string, () => DockerImageAsset, (recipes: ThinkboxDockerRecipes) => DockerImageAsset]>([
    [
      'remoteConnnectionServer',
      () => {
        return new DockerImageAsset(stack, 'SomeID', {
          directory: STAGE_PATH,
          buildArgs: RCS_RECIPE.buildArgs,
          target: RCS_RECIPE.target,
        });
      },
      (recipes) => {
        return recipes.remoteConnectionServer;
      },
    ],
    [
      'licenseForwarder',
      () => {
        return new DockerImageAsset(stack, 'SomeID', {
          directory: STAGE_PATH,
          buildArgs: LICENSE_FORWARDER_RECIPE.buildArgs,
          target: LICENSE_FORWARDER_RECIPE.target,
        });
      },
      (recipes) => {
        return recipes.licenseForwarder;
      },
    ],
  ])('has proper %p container image', (_imageName, getExpected, getActual) => {
    // GIVEN
    const expectedImage = getExpected();

    // WHEN
    const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
      stage,
    });
    const actualImage = getActual(recipes);

    // THEN
    expect(actualImage.assetHash).toEqual(expectedImage.assetHash);
  });

  describe('.version', () => {
    test('creates a VersionQuery when referenced', () => {
      // GIVEN
      const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
        stage,
      });

      // WHEN
      recipes.version;

      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_DEADLINE_INSTALLERS', {
        forceRun: Match.anyValue(),
        versionString: RELEASE_VERSION_STRING,
      });
    });

    test('does not create a VersionQuery when not referenced', () => {
      // GIVEN
      new ThinkboxDockerRecipes(stack, 'Recipes', {
        stage,
      });

      Template.fromStack(stack).resourceCountIs('Custom::RFDK_DEADLINE_INSTALLERS', 0);
    });

    test('.linuxInstallers.client creates an Asset using the client installer', () => {
      // GIVEN
      const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
        stage,
      });

      // WHEN
      const clientInstaller = recipes.version.linuxInstallers.client;

      // THEN
      const asset = recipes.node.findChild('ClientInstallerAsset') as Asset;
      expect(clientInstaller.s3Bucket).toEqual(asset.bucket);
      expect(clientInstaller.objectKey).toEqual(asset.s3ObjectKey);
    });

    test('.linuxInstallers.client successive accesses return the same bucket/key', () => {
      // GIVEN
      const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
        stage,
      });

      // WHEN
      const firstClientInstaller = recipes.version.linuxInstallers.client;
      const secondClientInstaller = recipes.version.linuxInstallers.client;

      // THEN
      expect(firstClientInstaller.objectKey).toBe(secondClientInstaller.objectKey);
      expect(firstClientInstaller.s3Bucket).toBe(secondClientInstaller.s3Bucket);
    });

    describe('.isLessThan()', () => {
      let recipes: ThinkboxDockerRecipes;
      beforeEach(() => {
        // GIVEN
        recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
          stage,
        });
      });

      test.each<[{ majorOffset?: number, minorOffset?: number, releaseOffset?: number }, boolean]>([
        [{ majorOffset: -1 }, false],
        [{ minorOffset: -1 }, false],
        [{ releaseOffset: -1 }, false],
        [{}, false],
        [{ majorOffset: 1 }, true],
        [{ minorOffset: 1 }, true],
        [{ releaseOffset: 1 }, true],
      ])('%s = %s', ({majorOffset, minorOffset, releaseOffset}, expectedResult) => {
        // GIVEN
        majorOffset = majorOffset ?? 0;
        minorOffset = minorOffset ?? 0;
        releaseOffset = releaseOffset ?? 0;
        const other = new Version([
          MAJOR_VERSION + majorOffset,
          MINOR_VERSION + minorOffset,
          RELEASE_VERSION + releaseOffset,
          0,
        ]);

        // WHEN
        const result = recipes.version.isLessThan(other);

        // THEN
        expect(result).toEqual(expectedResult);
      });
    });

    test('.linuxfullVersionString matches the stage manifest version', () => {
      // GIVEN
      const recipes = new ThinkboxDockerRecipes(stack, 'Recipes', {
        stage,
      });

      // WHEN
      const linuxFullVersionString = recipes.version.linuxFullVersionString();

      // THEN
      expect(linuxFullVersionString).toEqual(FULL_VERSION_STRING);
    });
  });

  test.each([
    ['rcs', {
      [LICENSE_FORWARDER_RECIPE_NAME]: LICENSE_FORWARDER_RECIPE,
    }],
    ['license-forwarder', {
      [RCS_RECIPE_NAME]: RCS_RECIPE,
    }],
  ])('manifest missing required recipe %s throws error', (_recipeName: string, recipes: DeadlineDockerRecipes) => {
    // GIVEN
    const isolatedStack = new Stack(app, 'IsolatedStack');

    class StageWithPublicConstructor extends Stage {
      constructor(props: StageProps) {
        super(props);
      }
    }

    const manifest: Manifest = {
      recipes,
      schema: 1,
      version: '1.2.3.4',
    };
    // WHEN
    expect(() => {
      new ThinkboxDockerRecipes(isolatedStack, 'Recipes', {
        stage: new StageWithPublicConstructor({
          manifest,
          path: '/some/path',
        }),
      });
    })
      // THEN
      .toThrow();
  });
});
