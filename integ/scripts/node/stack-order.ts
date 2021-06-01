/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is a command-line tool that parses a synthesized CDK manifest file and outputs the correct stack deployment or
 * destroy order based on the stack dependencies.
 *
 * Stack names are output one per line for ease of use in shell scripts.
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as path from 'path';

/**
 * The default path to look for the CDK cloud assembly manifest.
 */
const DEFAULT_MANIFEST_PATH = 'cdk.out/manifest.json';

/**
 * Represents which type of stack ordering is desired.
 */
enum OrderType {
  /**
   * Output the stacks in their correct order for a CDK deployment.
   *
   * Stacks without dependency stacks are output first.
   */
  DEPLOY,

  /**
   * Output the stacks in their correct order for a CDK destroy.
   *
   * Stacks without dependency stacks are output last.
   */
  DESTROY,
}

/**
 * Parsed program arguments as specified from the command-line.
 */
interface ProgramArguments {
  /**
   * The path to a cdk.out/manifest.json file of a synthesized CDK application
   */
  readonly manifestPath: string;

  /**
   * Whether the user desires the stack deployment order or stack destroy order
   */
  readonly orderType: OrderType;
}

/**
 * A partial definition of an artifact definition within a CDK manifest file
 */
interface Artifact {
  /**
   * The type of artifact
   */
  readonly type: string;
  /**
   * The key name of other artifacts that this artifact depends on
   */
  readonly dependencies?: string[];
}

/**
 * A partial JSON schema of a manifest.json file synthesized by CDK.
 */
interface Manifest {
  /**
   * The artifacts listed in the manifest
   */
  readonly artifacts: Record<string, Artifact>;
}

/**
 * A minimal internal representation of a CDK stack
 */
interface Stack {
  /**
   * The stack name
   */
  readonly name: string;

  /**
   * The names of the stacks that this stack depends on.
   */
  readonly dependencies: string[];
}

/**
 * Returns the command-line usage of this tool suitable for console output.
 */
function usage() {
  const baseName = path.basename(process.argv[1]);
  return `Usage:
  ${baseName} [-r] [MANIFEST_PATH]
Arguments:
  MANIFEST_PATH
    The path to CDK's synthesized manifest.json file. By default, CDK writes
    this file to a directory named "cdk.out" in the root of the CDK app.

    If not specified this defaults to "${DEFAULT_MANIFEST_PATH}".
  -r
    Reverses the order. Use this to output the stack destroy order. If not
    specified, the default is to output stack deploy order.`;
}

/**
 * Processes the command-line arguments and returns a parsed representation.
 *
 * Throws an `Error` with a user-facing error message if arguments are invalid.
 */
function parseProgramArguments(): ProgramArguments {
  let orderType: OrderType = OrderType.DEPLOY;
  let manifestPath: string = DEFAULT_MANIFEST_PATH;
  let reverseFlag: string | undefined;

  // Strip the first two arguments (node interpreter and the path to this script)
  const args = process.argv.slice(2);

  if (args.length === 2) {
    // Two arguments passed. Ensure the first is the "-r" flag
    [ reverseFlag, manifestPath ] = args;

    // Validate first arg is the -r flag
    if (reverseFlag !== '-r') {
      throw new Error(`Unexpected argument: "${reverseFlag}"`);
    }

    orderType = OrderType.DESTROY;
  } else if (args.length === 1) {
    if (args[0] === '-r') {
      orderType = OrderType.DESTROY;
    } else {
      // A single argument is passed containing the manifest path
      manifestPath = process.argv[2];
    }
  } else if (args.length > 2) {
    throw new Error(`Unexpected number of arguments (${args.length})`);
  }

  return {
    manifestPath,
    orderType,
  };
}

/**
 * An asynchronous function to read a UTF-8 encoded file.
 *
 * @param filePath The path of the file to be read
 */
async function readFileAsync(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
}

/**
 * Scans a parsed CDK manifest JSON structure and returns the stacks contained.
 *
 * @param manifest A parsed CDK manifest
 */
function findStacks(manifest: Manifest): Stack[] {
  // Stacks are top-level nodes in the "artifcats" object.
  return Object.entries<Artifact>(manifest.artifacts)
    .filter(entry => entry[1].type == 'aws:cloudformation:stack')
    .map(entry => {
      const [ name, artifact ] = entry;
      return {
        name,
        dependencies: artifact.dependencies ?? [],
      };
    });
}

/**
 * Orders stacks in their proper deploy/destroy order.
 *
 * @param stacks The stacks to be sorted
 * @param orderType The type of ordering to apply
 */
function sortStacks(stacks: Stack[], orderType: OrderType): Stack[] {
  /**
   * A set data structure of remaining stack names to be picked.
   */
  const remainingStacks: Set<string> = new Set<string>(stacks.map(s => s.name));

  /**
   * The sorted result array that we will accumulate stacks into
   */
  let sortedStacks: Stack[] = [];

  function hasPendingDependencies(stack: Stack): boolean {
    return stack.dependencies?.some(depStack => remainingStacks.has(depStack));
  }

  // Stacks with no dependencies remaining are picked on each loop iteration of the loop until there are no remaining stacks.
  while(remainingStacks.size > 0) {
    // Consider each remaining stack
    remainingStacks.forEach(stackName => {
      // Find the stack object by its name
      const stack = stacks.find(val => val.name == stackName)!;

      // We can deploy this stack if it has no remaining (or un-picked) dependencies
      if (!hasPendingDependencies(stack)) {
        sortedStacks.push(stack);
        remainingStacks.delete(stackName);
      }
    });
  }

  // For destroy order, we reverse the list
  if (orderType == OrderType.DESTROY) {
    sortedStacks = sortedStacks.reverse();
  }

  return sortedStacks;
}

/**
 * The entrypoint of the program.
 *
 * This processes and validates the command line arguments. It exits and
 * displays an error/usage output if the arguments are invalid.
 *
 * If the arguments are valid, it reads the specified CDK manifest file, sorts
 * the stacks in their correct deploy/destroy order, and outputs their names
 * in the resulting order - one per line.
 */
async function main() {
  let args: ProgramArguments;
  try {
    args = parseProgramArguments();
  } catch(e) {
    console.error(e.toString());
    console.error(usage());
    process.exit(1);
  }
  const manifestRaw = await readFileAsync(args.manifestPath);
  let manifest: Manifest | undefined;

  // Parse the JSON and cast to a Manifest
  try {
    manifest = JSON.parse(manifestRaw) as Manifest;
  } catch (e) {
    throw new Error(`${args.manifestPath} is not a valid JSON file`);
  }

  const stacks = findStacks(manifest);
  const sortedStacks = sortStacks(stacks, args.orderType);
  const sortedStackNames = sortedStacks.map(stack => stack.name);
  for (let stackName of sortedStackNames) {
    console.log(stackName);
  }
}

main()
  .catch(e => {
    if (e instanceof Error) {
      console.error(e.toString());
      if (e.stack) {
        console.error(e.stack.toString());
      }
      process.exit(1);
    }
  });
