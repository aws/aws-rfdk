/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  App,
  Stack,
} from 'aws-cdk-lib';
import {
  Match,
  Template,
} from 'aws-cdk-lib/assertions';

import {
  Manifest,
  Recipe,
  Stage,
  StageProps,
} from '../lib';

describe('Stage', () => {
  // GIVEN
  const STAGE_PATH = path.join(__dirname, 'assets');

  /**
   * A sub-class of Stage that makes the constructor public for testing purposes.
   *
   * This is to be able to specify a manifest rather than load it from the file-system via {@link Stage.fromDirectory}.
   */
  class StageWithPulicConstructor extends Stage {
    constructor(props: StageProps) {
      super(props);
    }
  }

  beforeEach(() => {
    jest.resetModules();
  });

  describe('.fromDirectory', () => {
    // GIVEN
    const manifest: Manifest = {
      schema: 1,
      version: '10.1.9.2',
      recipes: {},
    };

    const readFileSync = jest.spyOn(fs, 'readFileSync');
    let stage: Stage;

    beforeAll(() => {
      readFileSync.mockReturnValue(JSON.stringify(manifest));
      stage = require('../lib').Stage.fromDirectory(STAGE_PATH); // eslint-disable-line
    });

    afterAll(() => {
      readFileSync.mockRestore();
      jest.resetModules();
    });

    test('has dirPath', () => {
      // THEN
      expect(stage.dirPath).toBe(STAGE_PATH);
    });

    test('loads manifest.json from directory', () => {
      // THEN
      const expectedPath = path.join(STAGE_PATH, 'manifest.json');

      expect(readFileSync).toHaveBeenCalledWith(
        expectedPath,
        expect.objectContaining({
          encoding: 'utf8',
        }),
      );
      expect(stage.manifest).toEqual(manifest);
    });
  });

  test('.fromDirectory not supported version failure', () => {
    // GIVEN
    const manifest: Manifest = {
      schema: 1,
      version: '10.1.8.0',
      recipes: {},
    };

    // WHEN
    const readFileSync = jest.spyOn(fs, 'readFileSync');
    readFileSync.mockReturnValue(JSON.stringify(manifest));

    // THEN
    expect(() => {
      require('../lib').Stage.fromDirectory(STAGE_PATH) // eslint-disable-line
    }).toThrow('Staged Deadline Version (10.1.8.0) is less than the minimum supported version (10.1.9.2)');

    readFileSync.mockRestore();
    jest.resetModules();
  });

  test('has manifest', () => {
    const manifest: Manifest = {
      schema: 1,
      version: '10.1.9.2',
      recipes: {
        a: {
          title: 'a-title',
          description: 'a-description',
          buildArgs: {
            argone: 'a-argone-value',
            argtwo: 'a-argtwo-value',
          },
        },
        b: {
          title: 'b-title',
          description: 'b-description',
          buildArgs: {
            argone: 'b-argone-value',
            argtwo: 'b-argtwo-value',
          },
        },
      },
    };
    const stage = new StageWithPulicConstructor({
      manifest,
      path: STAGE_PATH,
    });

    // THEN
    expect(stage.manifest).toEqual(manifest);
  });

  describe('manifest validation', () => {
    test.each<[string, { manifest: any, expectedError?: string | RegExp | undefined }]>([
      [
        'mainfest wrong type',
        {
          manifest: 1,
          expectedError: /Expected object but got/,
        },
      ],
      [
        'manifest version not string',
        {
          manifest: {
            version: 1,
            recipes: {},
          },
        },
      ],
      [
        'missing schema',
        {
          manifest: {
            version: '10.1.9.2',
            recipes: {},
          },
          expectedError: /Manifest contains no "schema" key/,
        },
      ],
      [
        'wrong schema type', {
          manifest: {
            schema: 'a',
            version: '10.1.9.2',
            recipes: {},
          },
          expectedError: /Expected a numeric "schema" but got:/,
        },
      ],
      [
        'missing version', {
          manifest: {
            schema: 1,
            recipes: {},
          },
          expectedError: /Manifest contains no "version" key/,
        },
      ],
      [
        'incorrect version format', {
          manifest: {
            schema: 1,
            version: '10.1.',
            recipes: {},
          },
          expectedError: /Invalid version format/,
        },
      ],
      [
        'version not supported', {
          manifest: {
            schema: 1,
            version: '10.1.0.0',
            recipes: {},
          },
          expectedError: 'Staged Deadline Version (10.1.0.0) is less than the minimum supported version (10.1.9.2)',
        },
      ],
    ])('%s', (_name, testcase) => {
      const { manifest, expectedError } = testcase;
      // WHEN
      function when() {
        new StageWithPulicConstructor({
          path: STAGE_PATH,
          manifest,
        });
      }

      expect(when).toThrow(expectedError);
    });
  });

  describe('valid recipes', () => {
    test.each([
      [
        'build args and no target',
        {
          title: 'Eugene\'s Favorite Cookies',
          description: 'C is for cookie. That\'s good enough for me',
          buildArgs: {
            flour: '3 cups',
            butter: '1 cup',
            sugar: '1/2 cup',
            egg: '2',
            bakingpowder: '1 tsp',
            bakingsoda: '1 tsb',
            vanilla: '1 tsp',
            salt: '1 pinch',
          },
        },
      ],
      [
        'buildArgs and a target',
        {
          title: 'Josh\'s S\'mores',
          description: 'a secret family recipe',
          buildArgs: {
            grahamcracker: '2',
            marshmellow: '1',
            chocolate: '2',
            campfire: '1',
          },
          target: 'simplicity',
        },
      ],
      [
        'target and no buildArgs',
        {
          title: 'Jericho\s special brownie batch with a strawberry milkshake',
          description: 'a slight improvement to the original recipe',
          target: 'target',
        },
      ],
      [
        'no target or buildArgs',
        {
          title: 'Yash\'s Tequila Lime Shot (TLS)',
          description: 'A sure-fire way to brighten your day',
        },
      ],
    ])('%s', (_scenario: string, recipe: Recipe) => {
      // GIVEN
      const manifest: Manifest = {
        recipes: {
          recipeName: recipe,
        },
        schema: 1,
        version: '10.1.9.2',
      };

      // WHEN
      const stage = new StageWithPulicConstructor({
        manifest,
        path: STAGE_PATH,
      });

      // THEN
      expect(stage.manifest.recipes.recipeName).toEqual(recipe);
    });
  });

  describe('.imageFromRecipe()', () => {
    let app: App;
    let stack: Stack;

    beforeEach(() => {
      // GIVEN
      app = new App();
      stack = new Stack(app, 'Stack');
    });

    test('creates DockerImageAssets from existing recipes', () => {
      jest.resetModules();
      const mockDockerImageAssetConstructor = jest.fn();
      jest.mock('aws-cdk-lib/aws-ecr-assets', () => {

        class DockerImageAsset {
          constructor(...args: [any]) {
            mockDockerImageAssetConstructor(...args);
          }
        }

        return {
          DockerImageAsset,
        };
      });

      // Import the class under test now that the ec2 mock is in place
      const ReloadedStage = jest.requireActual('../lib').Stage; // eslint-disable-line

      class ReloadedStageWithPublicConstructor extends ReloadedStage {
        public constructor(props: StageProps) {
          super(props);
        }
      }

      // GIVEN
      const recipeName = 'myname';
      const recipe: Recipe = {
        description: 'some description',
        title: 'some title',
        buildArgs: {
          a: 'a',
          b: 'b',
        },
      };
      const stage = new ReloadedStageWithPublicConstructor({
        path: STAGE_PATH,
        manifest: {
          version: '10.1.9.2',
          schema: 1,
          recipes: {
            [recipeName]: recipe,
          },
        },
      });

      // WHEN
      stage.imageFromRecipe(stack, 'Image', recipeName);

      // THEN
      expect(mockDockerImageAssetConstructor).toHaveBeenCalledWith(
        stack,
        'Image',
        {
          ...recipe,
          directory: STAGE_PATH,
        },
      );
      expect(mockDockerImageAssetConstructor.mock.calls[0][2]).not.toMatchObject({
        target: expect.anything(),
      });
    });

    test('throws exception when recipe does not exist', () => {
      // GIVEN
      const manifest: Manifest = {
        schema: 1,
        version: '10.1.9.2',
        recipes: {},
      };
      const invalidRecipeName = 'this-recipe-does-not-exist';
      const stage = new StageWithPulicConstructor({
        manifest,
        path: STAGE_PATH,
      });

      // WHEN
      function when() {
        stage.imageFromRecipe(stack, 'Image', invalidRecipeName);
      }

      // THEN
      expect(when).toThrow(`No such recipe: ${invalidRecipeName}`);
    });
  });

  describe('.getVersion()', () => {
    test('returns a version in the success case', () => {
      // GIVEN
      const app = new App();
      const stack = new Stack(app, 'Stack');
      const manifest: Manifest = {
        schema: 1,
        version: '10.1.9.2',
        recipes: {},
      };
      const stage = new StageWithPulicConstructor({
        manifest,
        path: STAGE_PATH,
      });

      // WHEN
      stage.getVersion(stack, 'Version');
      Template.fromStack(stack).hasResourceProperties('Custom::RFDK_DEADLINE_INSTALLERS', {
        forceRun: Match.anyValue(),
        versionString: '10.1.9',
      });
    });
  });
});
