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
  tmpdir,
} from 'os';
import {
  join,
} from 'path';
import {
  promisify,
} from 'util';
import {
  getDiskUsage,
  growFilesystem,
  padFilesystem,
  setDefaultFilesize,
  shrinkFilesystem,
} from '../handlers';

// Prevent log from printing during the test
console.log = jest.fn();

jest.setTimeout(20000); // 20s timeout, to give time to files.

async function recursiveDeleteDirectory(location: string): Promise<void> {
  if (!location) return;
  const contents: string[] = await fsp.readdir(location);
  const stats =  await Promise.all(contents.map(async (loc) => {
    return await fsp.stat(join(location, loc));
  }));
  const files = contents.filter((_, i) => stats[i].isFile());
  const directories = contents.filter((_, i) => stats[i].isDirectory());

  await Promise.all(files.map(async(loc) => fsp.unlink(join(location, loc))));
  await Promise.all(directories.map(async(loc) => recursiveDeleteDirectory(join(location, loc))));
  await fsp.rmdir(location);
}

describe('Testing filesystem modifications', () => {

  var tempDirectory: string;

  beforeEach(async () => {
    // Create a temp directory for putting files.
    tempDirectory = await fsp.mkdtemp(join(tmpdir(), 'tmp.'));
  });
  afterEach(async () => {
    await recursiveDeleteDirectory(tempDirectory);
    tempDirectory = '';
  });

  test('Add to empty directory', async () => {
    // WHEN
    // Add 5 10MB files to the temp directory.
    await growFilesystem(5, 10, tempDirectory);

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(dirContents).toEqual(['00000', '00001', '00002', '00003', '00004']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(10485760);
    }
  });

  test('Append to directory', async () => {
    // GIVEN
    for (var i=4; i<8; i++) {
      const filename = join(tempDirectory, i.toString());
      await fsp.writeFile(filename, 'Some data');
    }

    // WHEN
    // Add 2 10MB files to the temp directory.
    await growFilesystem(2, 10, tempDirectory);

    // THEN
    // Make sure that the files that we added started numbering at 8
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(dirContents).toEqual(['00008', '00009', '4', '5', '6', '7']);
  });

  test('Delete from directory', async () => {
    // GIVEN
    for (var i=1; i<8; i++) {
      const filename = join(tempDirectory, i.toString().padStart(3, '0'));
      await fsp.writeFile(filename, 'Some data');
    }
    const preDirContents = (await fsp.readdir(tempDirectory)).sort();

    // WHEN
    // Remove two files from the filesystem
    await shrinkFilesystem(2, tempDirectory);

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(preDirContents).toEqual(['001', '002', '003', '004', '005', '006', '007']);
    expect(dirContents).toEqual(['001', '002', '003', '004', '005']);
  });
});

describe('Testing getDiskUsage behavior', () => {
  var tempDirectory: string;

  beforeEach(async () => {
    // Create a temp directory for putting files.
    tempDirectory = await fsp.mkdtemp(join(tmpdir(), 'tmp.'));
  });
  afterEach(async () => {
    await recursiveDeleteDirectory(tempDirectory);
    tempDirectory = '';
  });

  test('Throws when no mountPoint', async () => {
    await expect(() => getDiskUsage({
    },
    {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws mountPoint does not exist', async () => {
    await expect(() => getDiskUsage({
      mountPoint: join(tempDirectory, 'does_not_exist'),
    },
    {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws when mountPoint not a directory', async () => {
    // WHEN
    const filename = join(tempDirectory, '001');
    await fsp.writeFile(filename, 'Some data');

    // THEN
    await expect(() => getDiskUsage({
      mountPoint: filename,
    },
    {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Correctly calculates disk usage', async () => {
    // GIVEN

    // This overrides the default padding file size to 10MB from 1000MB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1GB files, but this little hack changes the semantics of those
    // to be phrased in terms of 10MB files.
    setDefaultFilesize(10);

    const execPromise = promisify(exec);
    await execPromise(`/usr/bin/dd if=/dev/zero of=${join(tempDirectory, 'file1.tmp')} bs=10MB count=1`);
    await fsp.mkdir(join(tempDirectory, 'subdir'));
    await execPromise(`/usr/bin/dd if=/dev/zero of=${join(tempDirectory, 'subdir', 'file2.tmp')} bs=10MB count=1`);

    // WHEN
    const usage = await getDiskUsage({
      mountPoint: tempDirectory,
    },
    {
      logGroupName: '',
      logStreamName: '',
    });

    // THEN
    expect(usage).toBe(2);
  });

});

describe('Testing padFilesystem macro behavior', () => {

  var tempDirectory: string;

  beforeEach(async () => {
    // Create a temp directory for putting files.
    tempDirectory = await fsp.mkdtemp(join(tmpdir(), 'tmp.'));
  });
  afterEach(async () => {
    await recursiveDeleteDirectory(tempDirectory);
    tempDirectory = '';
  });

  test('Throws when no desiredPadding', async () => {
    await expect(() => padFilesystem({
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws desiredPadding not number', async () => {
    await expect(() => padFilesystem({
      desiredPadding: 'one hundred',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws when no mountPoint', async () => {
    await expect(() => padFilesystem({
      desiredPadding: '2',
    }, {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws mountPoint does not exist', async () => {
    await expect(() => padFilesystem({
      desiredPadding: '2',
      mountPoint: join(tempDirectory, 'does_not_exist'),
    }, {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Throws when mountPoint not a directory', async () => {
    // WHEN
    const filename = join(tempDirectory, '001');
    await fsp.writeFile(filename, 'Some data');

    // THEN
    await expect(() => padFilesystem({
      desiredPadding: '2',
      mountPoint: filename,
    }, {
      logGroupName: '',
      logStreamName: '',
    })).rejects.toThrow();
  });

  test('Adds file if needed', async () => {
    // GIVEN
    // Empty directory: tempDirectory

    // This overrides the default padding file size to 10MB from 1000MB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1GB files, but this little hack changes the semantics of those
    // to be phrased in terms of 10MB files.
    setDefaultFilesize(10);

    // WHEN
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(dirContents).toEqual(['00000']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(10485760);
    }
  });

  test('Removes file if needed', async () => {
    // GIVEN
    // This overrides the default padding file size to 10MB from 1000MB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1GB files, but this little hack changes the semantics of those
    // to be phrased in terms of 10MB files.
    setDefaultFilesize(10);
    // tempDirectory with 2 10MB files in it
    await padFilesystem({
      desiredPadding: '2',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    });

    // WHEN
    const preDirContents = (await fsp.readdir(tempDirectory)).sort();
    // Desire to shrink down to 1 file
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(preDirContents).toEqual(['00000', '00001']);
    expect(dirContents).toEqual(['00000']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(10485760);
    }
  });

  test('No change to filesystem', async () => {
    // GIVEN
    // This overrides the default padding file size to 10MB from 1000MB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1GB files, but this little hack changes the semantics of those
    // to be phrased in terms of 10MB files.
    setDefaultFilesize(10);
    // tempDirectory with a 10MB file in it
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    });

    // WHEN
    const preDirContents = (await fsp.readdir(tempDirectory)).sort();
    // Desire for 10MB of files
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(preDirContents).toEqual(['00000']);
    expect(dirContents).toEqual(preDirContents);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(10485760);
    }
  });
});
