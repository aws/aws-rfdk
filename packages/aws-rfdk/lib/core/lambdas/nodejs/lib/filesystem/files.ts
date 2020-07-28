/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

export const readAsciiFile = async (filename: string): Promise<string> => {
  const file: fs.promises.FileHandle = await fs.promises.open(filename, 'r');
  try {
    const contents: string = await file.readFile('utf-8') as string;
    return contents;
  } finally {
    await file.close();
  }
};

export const readBinaryFile = async (filename: string): Promise<Buffer> => {
  const file: fs.promises.FileHandle = await fs.promises.open(filename, 'r');
  try {
    const contents: Buffer = await file.readFile() as Buffer;
    return contents;
  } finally {
    await file.close();
  }
};

export const writeAsciiFile = async (filename: string, contents: string): Promise<void> => {
  const file: fs.promises.FileHandle = await fs.promises.open(filename, 'w');
  try {
    await file.writeFile(contents, { encoding: 'utf-8' });
  } finally {
    await file.close();
  }
};

export const writeBinaryFile = async (filename: string, contents: Buffer): Promise<void> => {
  const file: fs.promises.FileHandle = await fs.promises.open(filename, 'w');
  try {
    await file.writeFile(contents);
  } finally {
    await file.close();
  }

};
