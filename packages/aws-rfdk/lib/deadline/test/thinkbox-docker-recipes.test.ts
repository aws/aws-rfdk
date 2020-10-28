/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  expect as expectCDK,
  haveResourceLike,
} from '@aws-cdk/assert';
import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets';
import {
  App,
  Stack,
} from '@aws-cdk/core';

import {
  DeadlineDockerRecipes,
  Manifest,
  Recipe,
  Stage,
  StageProps,
  ThinkboxDockerRecipes,
} from '../lib';

describe('ThinkboxDockerRecipes', () => {
  let app: App;
  let stack: Stack;
  let stage: Stage;

  // GIVEN
  const STAGE_PATH = path.join(__dirname, 'assets');
  const RCS_RECIPE_NAME = 'rcs';
  const RCS_RECIPE: Recipe = {
    description: 'rcs',
    title: 'rcs',
    buildArgs: {
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
      c: 'c',
      d: 'd',
    },
    target: 'lf',
  };

  const MAJOR_VERSION = 10;
  const MINOR_VERSION = 1;
  const RELEASE_VERSION = 9;
  const PATCH_VERSION = 2;
  const FULL_VERSION_STRING = `${MAJOR_VERSION}.${MINOR_VERSION}.${RELEASE_VERSION}.${PATCH_VERSION}`;

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
   * This is done by comparing the `sourceHash` property of the expected vs actual
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
    expect(actualImage.sourceHash).toEqual(expectedImage.sourceHash);
  });

  test('provides the Deadline version', () => {
    // WHEN
    new ThinkboxDockerRecipes(stack, 'Recipes', {
      stage,
    });

    expectCDK(stack).to(haveResourceLike('Custom::RFDK_DEADLINE_INSTALLERS', {
      versionString: FULL_VERSION_STRING,
    }));
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
