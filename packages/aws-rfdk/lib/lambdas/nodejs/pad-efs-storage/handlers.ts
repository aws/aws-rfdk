/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  promises as fsp,
} from 'fs';
import {
  join,
} from 'path';
import {
  LambdaContext,
} from '../lib/aws-lambda';
import {
  determineNextSequentialFilename,
  diskUsage,
  ensureIsDirectory,
  listNumberedFiles,
  nextSequentialFile,
  writePaddingFile,
} from './filesystem-ops';

/**
 * Default filesize for lambda operation, in MiB.
 * External code that calls this assumes that this is exactly 1GiB=1024MiB
 */
var FILESIZE: number = 1024;

/**
 * Provided solely for the purpose of testing to shrink the default file size from 1GiB
 * to something smaller.
 * @param filesize Desired filesize in MiB. Must be a multiple of 10
 */
export function setDefaultFilesize(filesize: number) {
  FILESIZE = filesize;
}

/**
 * Local helper to extract the desiredPadding field from the input event, and validate the input.
 * @param event Event object passed to the lambda handler.
 * @returns Value of desiredPadding or throws if invalid.
 */
function getDesiredPadding(event: { [key: string]: string }): number {
  const desiredPadding = parseInt(event.desiredPadding);
  if (isNaN(desiredPadding)) {
    throw new Error(`Could not parse 'desiredPadding' field of the given event: ${event.desiredPadding}`);
  }
  return desiredPadding;
}

/**
 * Local helper to extract the mountPoint field from the input event, and validate the input.
 * @param event Event object passed to the lambda handler.
 * @returns Value of mountPoint or throws if invalid.
 */
function getMountPoint(event: { [key: string]: string }): string {
  const mountPoint = event.mountPoint;
  if (!mountPoint) {
    throw new Error(`Invalid mount point given in event: ${mountPoint}`);
  }
  return mountPoint;
}

/**
 * Add numbered files (e.g. 00000, 00001) of a given size to a filesystem.
 * Note: exported so that we can test it.
 * @param numFilesToAdd How many numbered files to add.
 * @param filesize Size, in MiB, of the files to create.
 * @param mountPoint Directory in which to create the directory.
 */
export async function growFilesystem(numFilesToAdd: number, filesize: number, mountPoint: string): Promise<void> {
  // We find the highest numbered file created thus far, and start adding numbered files after it.
  let filename: string = await determineNextSequentialFilename(mountPoint);
  for (let i=0; i<numFilesToAdd; i++) {
    const outfilename = join(mountPoint, filename);
    await writePaddingFile(outfilename, filesize);
    filename = nextSequentialFile(filename);
  }
}

/**
 * Delete a given number of numbered files from the given filesystem.
 * Note: exported so that we can test it.
 * @param numFilesToRemove How many files to remove from the directory.
 * @param mountPoint Directory from which to delete files.
 */
export async function shrinkFilesystem(numFilesToRemove: number, mountPoint: string): Promise<void> {
  // Find all of the numbered "files" in the directory, and then delete the highest numbered ones until
  // we've deleted as many as we need to.
  const numberedFiles = await listNumberedFiles(mountPoint);
  let numFilesDeleted = 0;
  let index = numberedFiles.length - 1;
  while (numFilesDeleted < numFilesToRemove && index >= 0) {
    const filename = join(mountPoint, numberedFiles[index]);
    try {
      const stat = await fsp.stat(filename);
      if (stat.isFile()) {
        console.log(`Deleting: ${filename}`);
        try {
          await fsp.unlink(filename);
          numFilesDeleted += 1;
        } catch (err) {
          console.error(`Unable to delete: ${filename} -- Error: ${(err as Error)?.message}`);
        }
      }
    } catch (err) {
      console.warn(`Warning: Unable to stat file '${filename}'`);
    }
    index -= 1;
  }
  console.log(`Deleted ${numFilesDeleted} numbered files`);
  if (numFilesToRemove !== numFilesDeleted) {
    throw Error('Could not delete the desired number of files.');
  }
}

/**
 * Lambda handler. Expected to be invoked from a step function.
 * Calculates the disk size under the given directory. This is equivalent to calling:
 * du -sh -BG <directory>
 * @param event { "mountPoint": <string> }
 * @param context
 * @returns Disk usage in GiB
 */
export async function getDiskUsage(event: { [key: string]: string }, context: LambdaContext): Promise<number> {
  console.log(`Executing event: ${JSON.stringify(event)}`);
  console.log(`Context: ${JSON.stringify(context)}`);

  const mountPoint = getMountPoint(event);

  try {
    // Make sure that the given directory has been mounted before continuing.
    await ensureIsDirectory(mountPoint);
  } catch (err) {
    throw new Error(`Mount point '${mountPoint}' is not a directory. Please ensure that the EFS is mounted to this directory.`);
  }

  const scaledUsage = Math.floor(await diskUsage(mountPoint) / FILESIZE);

  return scaledUsage;
}

/**
 * Lambda handler. Expected to be invoked from a step function.
 * Adds or removes files from a given EFS filesystem to pad the filesystem with data.
 *
 * If the filesystem is padded to less than the number of desired GiB then files are added as numbered
 * files 1GiB in size to the given 'mountPoint'; adding at most 20 on each invocation.
 *
 * If the filesystem is padded with more than the desired GiB then numbered files are removed from the
 * given filesystem. Each numbered file is assumed to be exactly 1GiB in size.
 * @param event {
 *    "desiredPadding": "<integer number of GiB>",
 *    "mountPoint": "<string>"
 * }
 * @param context
 * @returns Nothing
 */
export async function padFilesystem(event: { [key: string]: string }, context: LambdaContext): Promise<void> {
  console.log(`Executing event: ${JSON.stringify(event)}`);
  console.log(`Context: ${JSON.stringify(context)}`);

  const desiredPadding = getDesiredPadding(event);
  const mountPoint = getMountPoint(event);

  try {
    // Make sure that the given directory has been mounted before continuing.
    await ensureIsDirectory(mountPoint);
  } catch (err) {
    throw new Error(`Mount point '${mountPoint}' is not a directory. Please ensure that the EFS is mounted to this directory.`);
  }

  const scaledUsage = Math.floor(await diskUsage(mountPoint) / FILESIZE);
  console.log(`Access point contains ${scaledUsage}GiB (rounded down) of data. Desired size is ${desiredPadding}GiB.`);
  if (scaledUsage < desiredPadding) {
    // Create files.

    // We'll be running this in a loop driven by a step function. Limit to 20GiB written per invocation,
    // just to avoid any chance of hitting a lambda timeout.
    const delta = Math.min(desiredPadding - scaledUsage, 20);

    console.log(`Adding ${delta}GiB of files to the filesystem to grow size.`);
    await growFilesystem(delta, FILESIZE, mountPoint);
  } else if (scaledUsage > desiredPadding) {
    // Remove files
    const delta = scaledUsage - desiredPadding;
    console.log(`Removing ${delta}GiB of files from the filesystem`);
    await shrinkFilesystem(delta, mountPoint);
  } else {
    console.log('No change to filesystem required.');
  }
}
