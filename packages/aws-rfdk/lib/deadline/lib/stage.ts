/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets';
import { Construct } from '@aws-cdk/core';

import { Utils } from '../../core';
import { VersionQuery } from './version';

/**
 * Build arguments to supply to a Docker image build
 */
export interface BuildArgs {
  readonly [name: string]: string;
}

/**
 * Docker container image recipe
 */
export interface Recipe {
  /**
   * Title of the recipe
   */
  readonly title: string;

  /**
   * Description of the recipe
   */
  readonly description: string;

  /**
   * Optional target for a Docker multi-stage build
   *
   * @default The last stage in the Dockerfile is used
   */
  readonly target?: string;

  /**
   * The Docker build arguments for the recipe
   *
   * @default No build arguments are supplied
   */
  readonly buildArgs?: BuildArgs;
}

/**
 * A collection of Deadline Docker recipes
 */
export interface DeadlineDockerRecipes {
  /**
   * A mapping of name to recipe
   */
  readonly [name: string]: Recipe | undefined;
}

/**
 * The manifest included with Deadline Docker image recipes
 */
export interface Manifest {
  /**
   * The manifest schema version number
   */
  readonly schema: number;

  /**
   * The version of Deadline that the staging directory contains
   */
  readonly version: string;

  /**
   * The recipes
   */
  readonly recipes: DeadlineDockerRecipes;
}

/**
 * Constructor properties of the {@link Stage} class
 */
export interface StageProps {
  /**
   * The path to the directory where Deadline is staged.
   */
  readonly path: string;

  /**
   * The parsed manifest that describes the contents of the stage directory.
   */
  readonly manifest: Manifest;
}

/**
 * Class for interacting with the Deadline stage directory
 *
 * The stage is a directory that conforms to a conventional structure that RFDK
 * requires to deploy Deadline. It should contain a manifest file, the Deadline
 * installers, and any supporting files required for building the Deadline
 * container.
 *
 * Note: Current version of RFDK supports Deadline v10.1.9 and later.
 */
export class Stage {
  /**
   * Loads and parses the manifest file from a given path
   * @param manifestPath The path to the manifest JSON file
   */
  public static loadManifest(manifestPath: string) {
    const content = fs.readFileSync(manifestPath, { encoding: 'utf8' });
    return JSON.parse(content) as Manifest;
  }

  /**
   * Returns a {@link Stage} loaded using the specified directory as the Docker build context
   * and loads and uses the manifest named `manifest.json` in the directory.
   *
   * @param stagePath The path to the Deadline stage directory
   */
  public static fromDirectory(stagePath: string) {
    const manifest = Stage.loadManifest(path.join(stagePath, Stage.MANIFEST_REL_PATH));
    return new Stage({
      manifest,
      path: stagePath,
    });
  }

  /**
   * The path to the manifest JSON file relative to the {@link Stage}'s directory'.
   */
  private static readonly MANIFEST_REL_PATH = 'manifest.json';

  /**
   * Ensures that the manifest is a valid manifest object schema.
   *
   * If the object does not fit the schema, then an Error is thrown.
   *
   * @param rawManifest The parsed manifest object
   */
  private static validateManifest(rawManifest: any): rawManifest is Manifest {
    if (rawManifest !== undefined && typeof rawManifest !== 'object') {
      throw new TypeError(`Expected object but got ${typeof rawManifest}`);
    }
    const schema = rawManifest.schema;
    if (schema === undefined) {
      throw new Error('Manifest contains no "schema" key');
    } else if (typeof schema !== 'number') {
      throw new TypeError(`Expected a numeric "schema" but got: ${typeof schema}`);
    }

    const version = rawManifest.version;
    if (version === undefined) {
      throw new Error('Manifest contains no "version" key');
    } else if (typeof version !== 'string') {
      throw new TypeError(`Expected a string "version" but got: ${typeof version}`);
    } else if (!Stage.validateVersionFormat(version)) {
      throw new Error(`Invalid version format - ${version}`);
    }

    // Do minimum supported deadline version check
    const minimumSupportedVersion = '10.1.9';
    if (Utils.versionCompare(version, minimumSupportedVersion) < 0) {
      throw new TypeError(`Staged Deadline Version (${version}) is less than the minimum supported version (${minimumSupportedVersion})`);
    }

    return true;
  }

  private static validateVersionFormat(version: string): boolean {
    /**
     * Regex: ^\d+(?:\.\d+){3}$
     * Matches a sequence of '.' separated numbers with exactly 4 digits.
     * - ^ asserts position at start of a line.
     * - \d+ Matches one or more digits.
     * - (?:\.\d+) Matches a dot and the following one or more digits.
     * - * Matches previous pattern zero or more times.
     * - $ asserts position at the end of a line
     */
    if (version.match(/^\d+(?:\.\d+)*$/g)) {
      return true;
    }
    return false;
  }

  /**
   * The path to the stage directory
   */
  public readonly dirPath: string;

  /**
   * The parsed manifest within the stage directory
   */
  public readonly manifest: Manifest;

  /**
   * Constructs a Stage instance
   *
   * @param dirPath The path to the Deadline staging directory
   * @param manifest The parsed manifest file
   */
  protected constructor(props: StageProps) {
    Stage.validateManifest(props.manifest);

    this.dirPath = props.path;
    this.manifest = props.manifest;
  }

  /**
   * Creates a {@link Version} based on the manifest version
   *
   * @param scope The parent scope
   * @param id The construct ID
   */
  public getVersion(scope: Construct, id: string) {
    return VersionQuery.exactString(scope, id, this.manifest.version);
  }

  /**
   * Construct a {@link DockerImageAsset} instance from a recipe in the Stage
   * @param scope The scope for the {@link DockerImageAsset}
   * @param id The construct ID of the {@link DockerImageAsset}
   * @param recipeName The name of the recipe
   */
  public imageFromRecipe(scope: Construct, id: string, recipeName: string) {
    const recipe = this.manifest.recipes[recipeName];
    if (!recipe) {
      throw new Error(`No such recipe: ${recipeName}`);
    }
    return new DockerImageAsset(scope, id, {
      directory: this.dirPath,
      ...recipe,
    });
  }
}
