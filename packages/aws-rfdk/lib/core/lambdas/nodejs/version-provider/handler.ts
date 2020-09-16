/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { IncomingMessage } from 'http';
import { SimpleCustomResource } from '../lib/custom-resource/simple-resource';

export interface IVersionProviderProperties {

  readonly versionString?: string

  readonly product: string;

  readonly platform: string;
}

export interface IInstallerVersion {
  /**
   * The major version number.
   */
  readonly MajorVersion: string;

  /**
   * The minor version number.
   */
  readonly MinorVersion: string;

  /**
   * The release version number.
   */
  readonly ReleaseVersion: string;

  /**
   * The patch version number.
   */
  readonly PatchVersion: string;

  /**
   * The URLs to installers
   */
  readonly Installers: any;
}

export class VersionProvider extends SimpleCustomResource {
  readonly indexFilePath: string|undefined;

  constructor(indexFilePath?: string) {
    super();
    this.indexFilePath = indexFilePath;
  }
  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public validateInput(data: object): boolean {
    return implementsIVersionProviderProperties(data);
  }

  /**
   * @inheritdoc
   */
  // @ts-ignore  -- we do not use the physicalId
  public async doCreate(physicalId: string, resourceProperties: IVersionProviderProperties): Promise<IInstallerVersion> {
    const indexJson = this.indexFilePath ? readInstallersIndex(this.indexFilePath) : downloadInstallerIndex();

    const productSection = indexJson[resourceProperties.product];

    if (!productSection) {
      throw new Error(`Information about product ${resourceProperties.product} can't be found`);
    }

    const versionString: string = resourceProperties.versionString ??
    getLatestVersion(resourceProperties.platform, productSection);

    const requestedVersion = parseVersionString( versionString );

    // Based on the requested version, fetches the latest patch and its installer file paths.
    const {versionMap, versionArray} = await getRequestedInstallerVersion(
      requestedVersion,
      productSection.versions);

    const versionForPlatform = versionMap[resourceProperties.platform];
    return {
      MajorVersion: versionArray[0],
      MinorVersion: versionArray[1],
      ReleaseVersion: versionArray[2],
      PatchVersion: versionArray[3],
      Installers: versionForPlatform,
    };
  }

  /**
   * @inheritdoc
   */
  /* istanbul ignore next */ // @ts-ignore
  public async doDelete(physicalId: string, resourceProperties: IVersionProviderProperties): Promise<void> {
    // Nothing to do -- we don't modify anything.
    return;
  }

}

export async function downloadInstallerIndex() {
  const productionInfoURL = 'https://downloads.thinkboxsoftware.com/product-info.json';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parsedUrl = require('url').parse(productionInfoURL);

  const options = {
    host: parsedUrl.hostname,
    path: parsedUrl.path,
  };

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('https').get(options, (res: IncomingMessage) => {
      let json = '';

      res.on('data', (chunk: any) => {
        // keep appending the response chunks until we get 'end' event.
        json += chunk;
      });

      res.on('end', () => {
        // complete response is available here:
        if (res.statusCode === 200) {
          try {
            // convert the response to a json object and return.
            const data = JSON.parse(json);
            resolve(data);
          } catch (e) {
            reject(e);
          }
        } else {
          reject('Expected status code 200, but got ' + res.statusCode);
        }
      });
    }).on('error', (err: Error) => {
      reject(err);
    });
  });
}

export function readInstallersIndex(filePath: string) :any {
  if (!fs.existsSync) {
    throw new Error(`File ${filePath} was not found`);
  }
  const data = fs.readFileSync(filePath, 'utf8');

  // convert the response to a json object and return.
  const json = JSON.parse(data);
  return json;
}

export function parseVersionString(versionString: string) {
  const VALID_VERSION_REGEX = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/;
  return VALID_VERSION_REGEX.exec(versionString);
}

export function implementsIVersionProviderProperties(value: any): boolean {
  if (!value || typeof(value) !== 'object') { return false; }
  if (value.versionString) {
    if (null === parseVersionString(value.versionString))  { return false; }
  }
  if (!value.product) { return false; }
  return true;
}


/**
 * This method looks for the requested version (partial or complete) in the
 * indexed version information. Based on the input, it iterates through all
 * four numbers in the version string and compares the requested version
 * with the indexed info.
 * If any of the requested version number is missing, it fetches the latest
 * (highest) available version for it.
 *
 * @param requestedVersion
 * @param indexedVersionInfo
 */
export async function getRequestedInstallerVersion(
  requestedVersion: RegExpExecArray | null,
  indexedVersionInfo: any) {

  let versionMap = indexedVersionInfo;
  const versionArray: string[] = [];

  // iterate through all 4 major, minor, release and patch numbers,
  // and get the matching version from the indexed version map.
  for (let versionIndex = 0; versionIndex < 4; versionIndex++) {
    let version;
    if (null === requestedVersion || null == requestedVersion[versionIndex + 1]) {

      // version is not provided, get the max version.
      const numberValues: number[] = (Object.keys(versionMap)).map((val: string) => {
        return parseInt(val, 10);
      });
      version = (Math.max(...numberValues)).toString();

    } else {
      version = requestedVersion[versionIndex + 1];
    }
    versionArray[versionIndex] = version;
    versionMap = versionMap[version];
  }

  return {versionMap, versionArray};
}

/**
 * This method returns the latest version for specified platform.
 *
 * @param platform
 * @param indexedVersionInfo
 */
export function getLatestVersion(platform: string, indexedVersionInfo: any) :string {
  const latestSection = indexedVersionInfo.latest;
  if (!latestSection) {
    throw new Error('Information about latest version can not be found');
  }

  const latestVersion = latestSection[platform];
  if (!latestVersion) {
    throw new Error(`Information about latest version for platform ${platform} can not be found`);
  }

  return latestVersion;
}