/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */
/* eslint-disable dot-notation */

import { Platform, Product, VersionProvider } from '../handler';

const handler = new VersionProvider('bin/index-test.json');
const indexTest = handler['readInstallersIndex']();

const productSection = indexTest[Product.deadline];

test('version parsing', () => {
  const result = handler['parseVersionString']('10.1.9.2');

  expect(result).not.toBeNull();

  if (result === null) { return; }
  expect(result[0]).toEqual('10.1.9.2');
  expect(result[1]).toEqual('10');
  expect(result[2]).toEqual('1');
  expect(result[3]).toEqual('9');
  expect(result[4]).toEqual('2');
});

test('latest version', () => {
  const result = handler['getLatestVersion'](Platform.linux, productSection);

  expect(result).toEqual('10.1.9.2');
});

test('get Uri for platform', () => {
  handler['getUrisForPlatform'](
    Product.deadline,
    productSection,
    Platform.linux,
    '10.1.9.2',
  ).then(result => {
    expect(result).not.toBeNull();

    expect(result?.MajorVersion).toEqual('10');
    expect(result?.MinorVersion).toEqual('1');
    expect(result?.ReleaseVersion).toEqual('9');
    expect(result?.PatchVersion).toEqual('2');
    expect(result?.Uris).toEqual({
      bundle: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/Deadline-10.1.9.2-linux-installers.tar',
      clientInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineClient-10.1.9.2-linux-x64-installer.run',
      repositoryInstaller: 's3://thinkbox-installers/Deadline/10.1.9.2/Linux/DeadlineRepository-10.1.9.2-linux-x64-installer.run',
    });
  },
  ).catch(error => {
    process.stderr.write(`${error.toString()}\n`);
    process.exit(1);
  });
});

test('get deadline version', async () => {
  const result = await handler.doCreate('physicalId',
    {
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
  await expect(handler.doCreate('physicalId',
    {
      product: Product.deadlineDocker,
    })).rejects.toThrowError(/Information about product DeadlineDocker can't be found/);
});

test('get deadline version for all platforms', async () => {
  const result = await handler.doCreate('physicalId',
    {
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

test('validate input', async () => {
  expect(handler.validateInput({
    product: Product.deadline,
    versionString: '10.1.9.2',
    platform: 'linux',
  })).toBeTruthy();

  expect(handler['implementsIVersionProviderProperties']('test')).toEqual(false);

  expect(handler.validateInput({
    versionString: 'version',
  })).toEqual(false);

  expect(handler.validateInput({
    product: Product.deadline,
    versionString: 'version',
  })).toEqual(false);

  expect(handler['implementsIVersionProviderProperties']({
    product: Product.deadline,
    platform: 'test',
  })).toEqual(false);
});

test('invalide file path', () => {
  expect(() => (new VersionProvider())['readInstallersIndex']()).toThrowError(/File path should be defined./);
  expect(() => (new VersionProvider('test.txt'))['readInstallersIndex']()).toThrowError(/File test.txt was not found/);
});

test('get latest version', () => {
  expect(() => handler['getLatestVersion']('linux',{})).toThrowError(/Information about latest version can not be found/);
  expect(() => handler['getLatestVersion']('linux',{latest: {}})).toThrowError(/Information about latest version for platform linux can not be found/);
});

test('get requested Uri version', () => {
  const requestedVersion = handler['parseVersionString']('10.1.9.2');
  expect(handler['getRequestedUriVersion'](requestedVersion, {
    10: {
      1: {
        9: {
          2: {
            linux: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz',
          },
        },
      },
    }}, Platform.linux, Product.deadlineDocker )).toEqual({
    MajorVersion: '10',
    MinorVersion: '1',
    ReleaseVersion: '9',
    PatchVersion: '2',
    Uris: {recipe: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz'},
  });

  expect(handler['getRequestedUriVersion'](requestedVersion, {
    10: {
      1: {
        9: {
          2: {
            linux: 's3://thinkbox-installers/DeadlineDocker/10.1.9.2/DeadlineDocker-10.1.9.2.tar.gz',
          },
        },
      },
    }}, Platform.windows, Product.deadlineDocker )).toEqual(undefined);
});