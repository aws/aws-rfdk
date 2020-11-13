/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable dot-notation */

import * as path from 'path';

import { Version } from '../version';
import {
  Platform,
  Product,
  VersionProvider,
} from '../version-provider';

const versionProvider = new VersionProvider(path.join(__dirname, 'index-test.json'));
const indexTest = versionProvider['readInstallersIndex']();

const productSection = indexTest[Product.deadline];

test.each([[Platform.linux, '10.1.9.2'],
  [Platform.mac, '10.1.9.2'],
  [Platform.windows, '10.1.8.5'],
])('latest version ', (platform: Platform, versionString: string) => {
  const result = versionProvider['getLatestVersion'](platform, productSection);

  expect(result).toEqual(versionString);
});

test.each([
  [Platform.linux, {
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/Deadline-10.1.9.2-linux-installers.tar',
    clientInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineClient-10.1.9.2-linux-x64-installer.run',
    repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineRepository-10.1.9.2-linux-x64-installer.run',
  } ],
  [Platform.windows, {
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Windows/Deadline-10.1.9.2-windows-installers.zip',
    clientInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Windows/DeadlineClient-10.1.9.2-windows-installer.exe',
    repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Windows/DeadlineRepository-10.1.9.2-windows-installer.exe',
  } ],
  [Platform.mac, {
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Mac/Deadline-10.1.9.2-osx-installers.dmg',
  } ],
])('get Uri for platform', async (platform: Platform, versionedUris: any) => {
  const result = versionProvider['getUrisForPlatform'](
    Product.deadline,
    productSection,
    platform,
    '10.1.9.2',
  );

  expect(result).not.toBeNull();
  expect(result?.Uris).toEqual(versionedUris);
});

test('get Uri for platform - bad version', async () => {
  const badVersion = 'badVersionString';
  expect(() => versionProvider['getUrisForPlatform'](
    Product.deadline,
    productSection,
    Platform.linux,
    badVersion,
  )).toThrowError(`Couldn't parse version from ${badVersion}`);
});

test('get deadline version', async () => {
  const result = await versionProvider.getVersionUris({
    product: Product.deadline,
    platform: Platform.linux,
    versionString: '10.1',
  });

  expect(result).not.toBeNull();
  const installerVersion = result.get(Platform.linux);
  expect(installerVersion).not.toBeNull();

  if (result === null) { return; }
  expect(installerVersion?.Uris).toEqual({
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/Deadline-10.1.9.2-linux-installers.tar',
    clientInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineClient-10.1.9.2-linux-x64-installer.run',
    repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineRepository-10.1.9.2-linux-x64-installer.run',
  });
  expect(installerVersion?.MajorVersion).toEqual('10');
  expect(installerVersion?.MinorVersion).toEqual('1');
  expect(installerVersion?.ReleaseVersion).toEqual('9');
  expect(installerVersion?.PatchVersion).toEqual('2');
});

test('product is not in file', async () => {
  await expect(versionProvider.getVersionUris({
    product: Product.deadlineDocker,
  })).rejects.toThrowError(/Information about product DeadlineDocker can't be found/);
});

test('get deadline version for all platforms', async () => {
  const result = await versionProvider.getVersionUris({
    product: Product.deadline,
  });

  expect(result).not.toBeNull();
  const linuxInstallerVersion = result.get(Platform.linux);
  expect(linuxInstallerVersion).not.toBeNull();

  if (result === null) { return; }
  expect(linuxInstallerVersion?.Uris).toEqual({
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/Deadline-10.1.9.2-linux-installers.tar',
    clientInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineClient-10.1.9.2-linux-x64-installer.run',
    repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineRepository-10.1.9.2-linux-x64-installer.run',
  });
  expect(linuxInstallerVersion?.MajorVersion).toEqual('10');
  expect(linuxInstallerVersion?.MinorVersion).toEqual('1');
  expect(linuxInstallerVersion?.ReleaseVersion).toEqual('9');
  expect(linuxInstallerVersion?.PatchVersion).toEqual('2');

  const macInstallerVersion = result.get(Platform.mac);
  expect(macInstallerVersion).not.toBeNull();

  if (result === null) { return; }
  expect(macInstallerVersion?.Uris).toEqual({
    bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Mac/Deadline-10.1.9.2-osx-installers.dmg',
  });
  expect(macInstallerVersion?.MajorVersion).toEqual('10');
  expect(macInstallerVersion?.MinorVersion).toEqual('1');
  expect(macInstallerVersion?.ReleaseVersion).toEqual('9');
  expect(macInstallerVersion?.PatchVersion).toEqual('2');

  const windowsInstallerVersion = result.get(Platform.windows);
  expect(windowsInstallerVersion).not.toBeNull();

  if (result === null) { return; }
  expect(windowsInstallerVersion?.Uris).toEqual({
    bundle: 's3://thinkbox-installers/Deadline/10.1.8.5/Windows/Deadline-10.1.8.5-windows-installers.zip',
    clientInstaller: 's3://thinkbox-installers/Deadline/10.1.8.5/Windows/DeadlineClient-10.1.8.5-windows-installer.exe',
    repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.8.5/Windows/DeadlineRepository-10.1.8.5-windows-installer.exe',
  });
  expect(windowsInstallerVersion?.MajorVersion).toEqual('10');
  expect(windowsInstallerVersion?.MinorVersion).toEqual('1');
  expect(windowsInstallerVersion?.ReleaseVersion).toEqual('8');
  expect(windowsInstallerVersion?.PatchVersion).toEqual('5');
});

test('not defined file path', () => {
  expect(() => (new VersionProvider())['readInstallersIndex']()).toThrowError(/File path should be defined./);
});

test('invalid file path', () => {
  expect(() => (new VersionProvider('test.txt'))['readInstallersIndex']()).toThrowError(/File test.txt was not found/);
});

test('get latest version without latest section', () => {
  expect(() => versionProvider['getLatestVersion']('linux',{})).toThrowError(/Information about latest version can not be found/);
});

test('get latest version without informtion for platform', () => {
  expect(() => versionProvider['getLatestVersion']('linux',{ latest: {} })).toThrowError(/Information about latest version for platform linux can not be found/);
});

test('get requested Uri version for existing product.', () => {
  const requestedVersion = Version.parseFromVersionString('10.1.9.2');

  expect(requestedVersion).not.toBeNull();
  if (requestedVersion === null) {
    return;
  }

  expect(versionProvider['getRequestedUriVersion'](
    requestedVersion,
    {
      10: {
        1: {
          9: {
            2: {
              linux: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz',
            },
          },
        },
      },
    },
    Platform.linux,
    Product.deadlineDocker,
  )).toEqual({
    MajorVersion: '10',
    MinorVersion: '1',
    ReleaseVersion: '9',
    PatchVersion: '2',
    Uris: { bundle: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz' },
  });
});

test('get requested Uri version for not existing product.', () => {
  const requestedVersion = Version.parseFromVersionString('10.1.9.2');

  expect(requestedVersion).not.toBeNull();
  if (requestedVersion === null) {
    return;
  }

  expect(versionProvider['getRequestedUriVersion'](
    requestedVersion,
    {
      10: {
        1: {
          9: {
            2: {
              linux: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz',
            },
          },
        },
      },
    },
    Platform.windows,
    Product.deadlineDocker,
  )).toEqual(undefined);
});
