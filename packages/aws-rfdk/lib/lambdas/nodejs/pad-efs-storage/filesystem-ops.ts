/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
  exec,
} from 'child_process';
import {
  promises as fsp,
} from 'fs';
import {
  promisify,
} from 'util';

/**
 * Verifies that the path given in the argument exists and is a directory.
 * @param location
 */
export async function ensureIsDirectory(location: string): Promise<void> {
  try {
    const stat = await fsp.stat(location);
    if (!stat.isDirectory()) {
      throw Error(`Must be a directory: ${location}`);
    }
  } catch (err) {
    throw Error(`No such file or directory: ${location}`);
  }
}

/**
 * Given a filename that is assumed to be numeric, return the next numeric
 * filename in increasing order padded out to 5 digits.
 * @param filename
 * @returns
 */
export function nextSequentialFile(filename: string): string {
  const value = parseInt(filename);
  return (value+1).toString().padStart(5, '0');
}

/**
 * List all of the names in the given directory that are numeric.
 * @param location Path of the directory to list. Assumed to be a directory.
 * @returns Array of the names of numeric contents in the directory, sorted into increasing order.
 */
export async function listNumberedFiles(location: string): Promise<string[]> {
  const dirContents = await fsp.readdir(location);
  const digitsRegex = /\d+/;
  const numericFiles = dirContents.filter(name => digitsRegex.test(name)).sort();
  return numericFiles;
}

/**
 * Invoke "du -sh -BMB" on the given location, to determine the total size in MB stored
 * in the filesystem location.
 * @param location Directory location.
 * @returns Filesystem size under the location, in MB.
 */
export async function diskUsage(location: string): Promise<number> {
  await ensureIsDirectory(location);

  const execPromise = promisify(exec);
  const { stdout, stderr } = await execPromise(`/usr/bin/du -sh -BMB ${location}`);
  if (stderr) {
    throw Error(stderr);
  }
  // stdout will be: <number>M\t<location>\n
  const size = parseInt(stdout);
  if (isNaN(size)) {
    throw Error(`Unexpected error. Could not parse size of directory ${location}: ${stdout}`);
  }
  return size;
}

/**
 * Inspect the filenames in the given directory location, and return the next highest numeric
 * filename that does not already exist.
 * e.g.
 *  i) Empty dir -> 00000
 *  ii) '00000', '00002' -> '00003'
 * @param location Directory to inspect.
 * @returns
 */
export async function determineNextSequentialFilename(location: string): Promise<string> {
  const numericFiles = await listNumberedFiles(location);
  if (numericFiles.length == 0) {
    return '00000';
  }
  return nextSequentialFile(numericFiles[numericFiles.length-1]);
}

/**
 * Writes a file of zeroes to the given location.
 * @param filename Name of the file to create.
 * @param filesize Size of the file in MB. Must be a multiple of 10.
 */
export async function writePaddingFile(filename: string, filesize: number): Promise<void> {
  const execPromise = promisify(exec);
  const command = `/usr/bin/dd if=/dev/zero of=${filename} bs=10MB count=${filesize/10}`;
  console.log(`Writing ${filesize}MB to ${filename}: ${command}`);
  const { stderr } = await execPromise(command);
  console.log(stderr);
}
