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
    // Add 5 64 MiB files to the temp directory.
    await growFilesystem(5, 64, tempDirectory);

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(dirContents).toEqual(['00000', '00001', '00002', '00003', '00004']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(67108864);
    }
  });

  test('Append to directory', async () => {
    // GIVEN
    for (var i=4; i<8; i++) {
      const filename = join(tempDirectory, i.toString());
      await fsp.writeFile(filename, 'Some data');
    }

    // WHEN
    // Add 2 64 MiB files to the temp directory.
    await growFilesystem(2, 64, tempDirectory);

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
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Throws mountPoint does not exist', async () => {
    await expect(() => getDiskUsage({
      mountPoint: join(tempDirectory, 'does_not_exist'),
    },
    {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
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
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Correctly calculates disk usage', async () => {
    // GIVEN

    // This overrides the default padding file size to 64 MiB from 1024 MiB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1 GiB files, but this little hack changes the semantics of those
    // to be phrased in terms of 64 MiB files.
    setDefaultFilesize(64);

    const execPromise = promisify(exec);
    await execPromise(`/usr/bin/dd if=/dev/zero of=${join(tempDirectory, 'file1.tmp')} bs=32M count=2`);
    await fsp.mkdir(join(tempDirectory, 'subdir'));
    await execPromise(`/usr/bin/dd if=/dev/zero of=${join(tempDirectory, 'subdir', 'file2.tmp')} bs=32M count=2`);

    // WHEN
    const usage = await getDiskUsage({
      mountPoint: tempDirectory,
    },
    {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
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
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Throws desiredPadding not number', async () => {
    await expect(() => padFilesystem({
      desiredPadding: 'one hundred',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Throws when no mountPoint', async () => {
    await expect(() => padFilesystem({
      desiredPadding: '2',
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Throws mountPoint does not exist', async () => {
    await expect(() => padFilesystem({
      desiredPadding: '2',
      mountPoint: join(tempDirectory, 'does_not_exist'),
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
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
      getRemainingTimeInMillis: () => 1000,
    })).rejects.toThrow();
  });

  test('Adds file if needed', async () => {
    // GIVEN
    // Empty directory: tempDirectory

    // This overrides the default padding file size to 64 MiB from 1024 MiB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1 GiB files, but this little hack changes the semantics of those
    // to be phrased in terms of 64 MiB files.
    setDefaultFilesize(64);

    // WHEN
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(dirContents).toEqual(['00000']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(67108864);
    }
  });

  test('Removes file if needed', async () => {
    // GIVEN
    // This overrides the default padding file size to 64 MiB from 1024 MiB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1 GiB files, but this little hack changes the semantics of those
    // to be phrased in terms of 64 MiB files.
    setDefaultFilesize(64);

    // tempDirectory with 2 64 MiB files in it
    await padFilesystem({
      desiredPadding: '2',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
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
      getRemainingTimeInMillis: () => 1000,
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(preDirContents).toEqual(['00000', '00001']);
    expect(dirContents).toEqual(['00000']);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(67108864);
    }
  });

  test('No change to filesystem', async () => {
    // GIVEN
    // This overrides the default padding file size to 64 MiB from 1024 MiB. Keep this in mind when interpreting the test.
    // All of the interface points are phrased in terms of 1 GiB files, but this little hack changes the semantics of those
    // to be phrased in terms of 64 MiB files.
    setDefaultFilesize(64);

    // tempDirectory with a 64 MiB file in it
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
    });

    // WHEN
    const preDirContents = (await fsp.readdir(tempDirectory)).sort();
    // Desire for 64 MiB of files
    await padFilesystem({
      desiredPadding: '1',
      mountPoint: tempDirectory,
    }, {
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 1000,
    });

    // THEN
    const dirContents = (await fsp.readdir(tempDirectory)).sort();
    expect(preDirContents).toEqual(['00000']);
    expect(dirContents).toEqual(preDirContents);
    for (var file of dirContents) {
      const stat = await fsp.stat(join(tempDirectory, file));
      expect(stat.size).toBe(67108864);
    }
  });
});
