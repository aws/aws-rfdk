#!/usr/bin/env node

/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {spawnSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { types } from 'util';

import { Version } from '../lib/deadline';
import {
  IUris,
  Platform,
  Product,
  VersionProvider,
} from '../lib/lambdas/nodejs/lib/version-provider';

const args = process.argv.slice(2);

let deadlineInstallerURI = '';
let dockerRecipesURI = '';
let deadlineReleaseVersion = '';
let outputFolder = './stage';
let verbose = false;

// Parse command parameters
let n = 0;
while (n < args.length) {
  switch (args[n]) {
    case '-d':
    case '--deadlineInstallerURI':
      n++;
      deadlineInstallerURI = args[n];
      break;
    case '-c':
    case '--dockerRecipesURI':
      n++;
      dockerRecipesURI = args[n];
      break;
    case '-o':
    case '--output':
      n++;
      outputFolder = args[n];
      break;
    case '--verbose':
      verbose = true;
      break;
    default:
      if (!deadlineReleaseVersion){
        deadlineReleaseVersion = args[n];
      } else {
        console.error(`Unexpected command parameter ${args[n]}`);
        process.exit(1);
      }
      break;
  }
  n++;
}

if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
} else if (fs.readdirSync(outputFolder).length > 0) {
  console.error('The target directory is not empty.');
  process.exit(1);
}

const handler = new VersionProvider();

// populate installer URI
if (deadlineInstallerURI === '') {
  handler.getVersionUris({ platform: Platform.linux, product: Product.deadline, versionString: deadlineReleaseVersion})
    .then(result => {
      const installerVersion = result.get(Platform.linux);
      if (installerVersion) {
        validateDeadlineVersion(`${installerVersion.MajorVersion}.${installerVersion.MinorVersion}.${installerVersion.ReleaseVersion}.${installerVersion.PatchVersion}`);
        const installerUrl = (<IUris>installerVersion.Uris).clientInstaller;
        if (installerUrl) {
          getDeadlineInstaller(installerUrl);
        }
      }
      else {
        console.error(`Deadline installer for version ${deadlineReleaseVersion} was not found.`);
        exitAndCleanup(1);
      }
    })
    .catch(error => {
      console.error(error.message);
      exitAndCleanup(error.code);
    });
}
else {
  getDeadlineInstaller(deadlineInstallerURI);
}


// populate docker recipe URI
if (dockerRecipesURI === '') {
  handler.getVersionUris({ platform: Platform.linux, product: Product.deadlineDocker, versionString: deadlineReleaseVersion})
    .then(result => {
      const installerVersion = result.get(Platform.linux);
      if (installerVersion) {
        getDockerRecipe((<IUris>installerVersion.Uris).bundle);
      }
      else {
        console.error(`Docker recipies for version ${deadlineReleaseVersion} was not found.`);
        exitAndCleanup(1);
      }
    })
    .catch(error => {
      console.error(error.message);
      exitAndCleanup(error.code);
    });
}
else {
  getDockerRecipe(dockerRecipesURI);
}

/**
 * Download Deadline installer
 *
 * @param deadlineInstallerUri - Specifies a URI pointing to the Deadline Linux Client installer. This currently supports S3 URIs.
 */
function getDeadlineInstaller(deadlineInstallerUri: string) {
  const deadlineInstallerURL = new url.URL(deadlineInstallerUri);

  if (deadlineInstallerURL.protocol !== 's3:') {
    console.error(`ERROR: Invalid URI protocol ("${deadlineInstallerURL.protocol}") for --deadlineInstallerURI. Only "s3:" URIs are supported.`);
    usage(1);
  }

  if (!validateBucketName(deadlineInstallerURL.hostname)) {
    usage(1);
  }

  try {
    // Get Deadline client installer
    const deadlineInstallerPath = getFile({
      uri: deadlineInstallerURL,
      targetFolder: path.join(outputFolder, 'bin'),
      verbose,
    });

    // Make installer executable
    makeExecutable(deadlineInstallerPath);
  } catch (e) {
    let errorMsg: string;
    if (types.isNativeError(e)) {
      errorMsg = e.message;
    } else {
      errorMsg = e.toString();
    }
    console.error(`ERROR: ${errorMsg}`);
    exitAndCleanup(1);
  }
}

/**
 * Download and extract Docker recipe.
 *
 * @param dockerRecipesUri - Specifies a URI pointing to the Deadline Docker recipes. This currently supports S3 URIs.
 */
function getDockerRecipe(dockerRecipesUri: string) {
  const dockerRecipeURL = new url.URL(dockerRecipesUri);

  if (dockerRecipeURL.protocol !== 's3:') {
    console.error(`ERROR: Invalid URI protocol ("${dockerRecipeURL.protocol}") for --dockerRecipeURL. Only "s3:" URIs are supported.`);
    usage(1);
  }

  if (!validateBucketName(dockerRecipeURL.hostname)) {
    usage(1);
  }

  try {
    // Get Docker recipe
    getAndExtractArchive({
      uri: dockerRecipeURL,
      targetFolder: outputFolder,
      verbose,
      tarOptions: [`-x${verbose ? 'v' : ''}z`],
    });
  } catch (e) {
    let errorMsg: string;
    if (types.isNativeError(e)) {
      errorMsg = e.message;
    } else {
      errorMsg = e.toString();
    }
    console.error(`ERROR: ${errorMsg}`);
    exitAndCleanup(1);
  }
}

/**
 * Attempts to add UNIX executable permission bits to a file.
 *
 * Any errors are caught and:
 *  - more user-friendly error message is displayed
 *
 * @param filePath Path to make executable
 */
function makeExecutable(filePath: string) {
  try {
    let mode = fs.statSync(filePath).mode;
    // eslint-disable-next-line no-bitwise
    mode = mode | fs.constants.S_IXUSR | fs.constants.S_IXGRP | fs.constants.S_IXOTH;
    fs.chmodSync(filePath, mode);
  } catch (e) {
    let errorDetail: string;
    if (e instanceof Error) {
      errorDetail = e.message;
    } else {
      errorDetail = e.toString();
    }
    throw new Error(`Could not add executable permission to Deadline installer: ${errorDetail}`);
  }
}

/**
 * Validate name of S3 bucket
 *
 * @param s3BucketName - name of S3 bucket
 */
function validateBucketName(s3BucketName: string): boolean {
  const regExpForS3Bucket = new RegExp('^([a-z]|(\\d(?!\\d{0,2}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})))\
([a-z\\d]|(\\.(?!(\\.|-)))|(-(?!\\.))){1,61}[a-z\\d]$');
  if (!regExpForS3Bucket.test(s3BucketName)) {
    console.error(`S3 bucket name '${s3BucketName}' has invalid format.\
    Please follow S3 bucket naming requirements:\
    https://docs.aws.amazon.com/AmazonS3/latest/dev/BucketRestrictions.html`);
    return false;
  }
  return true;
}

/**
 * Spawns a shell then executes the command within that shell.
 * Method will not return until the child process has fully closed.
 *
 * @param command - The command to run.
 * @param showCommand - If true shows which command will be spawned.
 */
function spawnCommand(command: string, showCommand?: boolean, commandArgs: string[] = []): boolean {
  if (showCommand) {
    console.info(`Command: ${command} ${commandArgs.join(' ')}`);
  }
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
  });
  return result.status === 0;
}

/**
 * Show help string for usage and exit with error code.
 *
 * @param errorCode - THe code of error that will be returned.
 */
function usage(errorCode: number) {
  console.info(`
Stages a Deadline release for building Docker container images with RFDK.
This tool requires that tar and the AWS CLI are installed.
The AWS CLI must be configured to authenticate using your AWS account. This can be done by configuring your default profile or with environment.
See https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html for documentation on how to configure the AWS CLI.

Usage: stage-deadline [--output <output_dir>] [--verbose]
                      <deadline_release_version>
  OR
       stage-deadline [--output <output_dir>] [--verbose]
                      -d <deadline_installer_uri>
                      -c <deadline_recipes_uri>


Arguments:
    <deadline_release_version>
        Specifies the official release of Deadline that should be staged. This must be of the form "a.b.c.d", "a.b.c", "a.b" or "a".

        Note: The minimum supported deadline version is ${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION}

    -d, --deadlineInstallerURI <deadline_installer_uri>
        Specifies a URI pointing to the Deadline Linux Client installer. This currently supports S3 URIs of the form:

        s3://thinkbox-installers/Deadline/10.1.x.y/Linux/DeadlineClient-10.1.x.y-linux-x64-installer.run

        If this argument is provided <deadline_release_version> will be ignored for Deadline Linux Client.

    -c, --dockerRecipesURI <deadline_recipes_uri>
        Specifies a URI pointing to the Deadline Docker recipes. This currently supports S3 URIs of the form:

        s3://thinkbox-installers/DeadlineDocker/10.1.x.y/DeadlineDocker-10.1.x.y.tar.gz

        If this argument is provided <deadline_release_version> will be ignored for Deadline Docker recipes.

Options:
    -o, --output <output_dir>
        Specifies a path to an output directory where Deadline will be staged. The default is to use a "stage"
        sub-directory of the working directory.

    --verbose
        Increases the verbosity of the output
  `.trimStart());
  exitAndCleanup(errorCode);
}

/**
 * Exit with error code and remove output folder.
 *
 * @param errorCode - THe code of error that will be returned.
 */
function exitAndCleanup(errorCode: number) {
  fs.rmdirSync(outputFolder, {recursive: true});
  process.exit(errorCode);
}

/**
 * Configuration for fetching a file
 */
interface GetFileProps {
  /**
   * The URI to the file.
   *
   * Only S3 URIs are supported
   */
  uri: url.URL;

  /**
   * Path to the output directory
   */
  targetFolder: string;

  /**
   * Whether to include diagnostic output when transferring the file.
   *
   * @default false
   */
  verbose?: boolean;
}

/**
 * Gets a file from a specified URI.
 *
 * This is currently limited to obtaining objects from S3.
 *
 * @param props Properties for fetching the file
 * @returns The path to the fetched file
 */
function getFile(props: GetFileProps) {
  if (!fs.existsSync(props.targetFolder)) {
    fs.mkdirSync(props.targetFolder);
  }

  const cmdArgs = ['s3', 'cp'];
  if (!props.verbose) {
    cmdArgs.push('--quiet');
  }
  cmdArgs.push(props.uri.href);
  cmdArgs.push(props.targetFolder);

  const success = spawnCommand('aws', props.verbose, cmdArgs);

  if (!success) {
    throw new Error(`Could not fetch ${props.uri.href} (Are you authenticated with the AWS CLI?)`);
  }

  return path.join(props.targetFolder, uriFilename(props.uri));
}

/**
 * Return the filename portion of the URL.
 *
 * This is the right-most component (separated by / characters) of a URI's path.
 *
 * @param uri The source URI
 */
function uriFilename(uri: url.URL): string {
  const pathParts = uri.pathname.split('/');
  const fileName = pathParts[pathParts.length - 1];
  return fileName;
}

/**
 * Configuration for fetching and extracting a file
 */
interface GetExtractArchiveProps extends GetFileProps {
  /**
   * Additional command-line arguments to supply to the `tar` command when extracting the archive
   */
  tarOptions: [string];
}

/**
 * Obtain and extract a tar archive.
 *
 * @param props Properties to specify how to get and extract the archive
 */
function getAndExtractArchive(props: GetExtractArchiveProps) {
  const { targetFolder, tarOptions } = props;

  const tarPath = getFile(props);

  const filesExtracted = spawnCommand('tar', props.verbose, [
    '-C',
    targetFolder,
    ...tarOptions,
    '-f',
    tarPath,
  ]);

  if (fs.existsSync(tarPath)) {
    fs.unlinkSync(tarPath);
  }

  // Exit with error if recipe wasn't extracted.
  if (!filesExtracted) {
    throw new Error(`File ${tarPath} has not been extracted successfully.`);
  }
}

function validateDeadlineVersion(versionString: string) {
  // Automatically populate the installer & recipe URI using the version, if it is provided.
  try {
    const version = Version.parse(versionString);
    if(version.isLessThan(Version.MINIMUM_SUPPORTED_DEADLINE_VERSION)) {
      console.error(`ERROR: Unsupported Deadline Version ${version.toString()}. Minimum supported version is ${Version.MINIMUM_SUPPORTED_DEADLINE_VERSION} \n`);
      usage(1);
    }
  } catch(e) {
    console.error(`ERROR: ${(e as Error).message} \n`);
    usage(1);
  }
}
