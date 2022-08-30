/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

import {
  IVersion,
  Version,
  VersionQuery,
} from './';

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
  readonly [name: string]: Recipe;
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
 * Note: Current version of RFDK supports Deadline v10.1.9.2 and later.
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
    /* istanbul ignore else */
    if (version === undefined) {
      throw new Error('Manifest contains no "version" key');
    } else if (typeof version !== 'string') {
      throw new TypeError(`Expected a string "version" but got: ${typeof version}`);
    }

    // Do minimum supported deadline version check
    const stagedVersion = Version.parse(version);
    if (stagedVersion.isLessThan(Version.MINIMUM_SUPPORTED_DEADLINE_VERSION)) {
      throw new TypeError(`Staged Deadline Version (${version}) is less than the minimum supported version (${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION.toString()})`);
    }

    return true;
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
  public getVersion(scope: Construct, id: string): IVersion {
    const releaseVersion = this.getReleaseVersion(this.manifest.version);
    return new VersionQuery(scope, id, { version: releaseVersion });
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

  /**
   * This removes the patch version from a full version string. No validation is done as that is handled
   * in the constructor with the version check.
   */
  private getReleaseVersion(fullVersion: string): string {
    const versionComponents = fullVersion.split('.');
    return `${versionComponents[0]}.${versionComponents[1]}.${versionComponents[2]}`;
  }

  public get clientInstallerPath(): string {
    const INSTALLER_FILENAME_RE = /^DeadlineClient-(?<version>.+)-linux-x64-installer\.run$/;

    const listing = fs.readdirSync(
      path.join(
        this.dirPath,
        'bin',
      ),
    ).filter(filename => INSTALLER_FILENAME_RE.test(filename));

    /* istanbul ignore else */
    if (listing.length === 1) {
      const filename = listing[0];
      const match = INSTALLER_FILENAME_RE.exec(filename);
      const version = match!.groups!.version;
      const recipes = Array.from(Object.values(this.manifest.recipes));
      const aRecipeHasMatchingDlVersion = recipes.some((recipe) => {
        return recipe.buildArgs?.DL_VERSION === version;
      });
      const installerPath = path.join(
        this.dirPath,
        'bin',
        listing[0],
      );
      if (!aRecipeHasMatchingDlVersion) {
        throw new Error(`No stage recipes refer to the Deadline Client installer found (${installerPath})`);
      }
      return installerPath;
    } else if (listing.length === 0) {
      throw new Error(`No matching Client installer found in "${this.dirPath}"`);
    } else {
      throw new Error(`Multiple Client installers found: ${listing.join(',')}`);
    }
  }
}
