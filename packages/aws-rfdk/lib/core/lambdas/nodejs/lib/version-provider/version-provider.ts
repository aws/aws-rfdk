/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';
import * as url from 'url';

import { Version } from './version';

export enum Platform {
  linux = 'linux',

  mac = 'mac',

  windows = 'windows',
}

export enum Product {
  deadline = 'Deadline',

  deadlineDocker = 'DeadlineDocker',
}

export interface IVersionProviderProperties {
  readonly versionString?: string

  readonly product: Product;

  readonly platform?: Platform;
}

export interface IUris {
  readonly bundle: string;

  readonly clientInstaller?: string;

  readonly repositoryInstaller?: string;

  readonly certificateInstaller?: string;
}

export interface IVersionedUris {
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
  readonly Uris: IUris;
}

/**
 * The version provider parses a JSON file containing version information for the Deadline and DockerDeadline products.
 * It  can be downloaded or loaded from local file and returns URIs for the specific products.
 * By default returns the last version of URIs or specified full or partial version.
 * If platform is not defined returns URIs for each platform.
 */
export class VersionProvider {
  private static readonly VERSION_INDEX_URL = 'https://downloads.thinkboxsoftware.com/version_info.json';

  private readonly indexFilePath: string|undefined;

  constructor(indexFilePath?: string) {
    this.indexFilePath = indexFilePath;
  }

  /**
   * Returns URIs for specified product
   */
  public async getVersionUris(resourceProperties: IVersionProviderProperties): Promise<Map<Platform, IVersionedUris>> {
    const indexJson = this.indexFilePath ? this.readInstallersIndex() : await this.downloadInstallerIndex();

    const productSection = indexJson[resourceProperties.product];

    if (!productSection) {
      throw new Error(`Information about product ${resourceProperties.product} can't be found`);
    }

    let installers = new Map();
    if (resourceProperties.platform) {
      const versionedUris = this.getUrisForPlatform(
        resourceProperties.product,
        productSection,
        resourceProperties.platform,
        resourceProperties.versionString);

      if (versionedUris) {
        installers.set(resourceProperties.platform, versionedUris);
      }

    } else {
      Object.values(Platform).forEach(async p => {
        const versionedUris = this.getUrisForPlatform(
          resourceProperties.product,
          productSection,
          p,
          resourceProperties.versionString);

        if (versionedUris) {
          installers.set(p, versionedUris);
        }
      });
    }

    return installers;
  }

  private async downloadInstallerIndex() {
    const parsedUrl = url.parse(VersionProvider.VERSION_INDEX_URL);

    const options = {
      host: parsedUrl.hostname,
      path: parsedUrl.path,
    };

    return new Promise((resolve, reject) => {
      https.get(options, (res: IncomingMessage) => {
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
            reject(new Error(`Expected status code 200, but got ${res.statusCode}`));
          }
        });
      }).on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * This method reads index file and return parsed JSON object from this file content.
   */
  private readInstallersIndex(): any {
    if (!this.indexFilePath) {
      throw new Error('File path should be defined.');
    }
    if (!fs.existsSync(this.indexFilePath)) {
      throw new Error(`File ${this.indexFilePath} was not found`);
    }
    const data = fs.readFileSync(this.indexFilePath, 'utf8');

    // convert the response to a json object and return.
    const json = JSON.parse(data);
    return json;
  }

  /**
   * This method returns IVersionedUris (the patch version plus installer URI's) for a specific platform.
   */
  private getUrisForPlatform(
    product: Product,
    productSection: any,
    platform: Platform,
    version?: string,
  ): IVersionedUris | undefined {
    const versionString: string = version ? version : this.getLatestVersion(platform, productSection);
    const requestedVersion = Version.parseFromVersionString(versionString);

    if (!requestedVersion) {
      throw new Error(`Couldn't parse version from ${versionString}`);
    }

    return this.getRequestedUriVersion(
      requestedVersion,
      productSection.versions,
      platform,
      product,
    );
  }

  /**
   * This method returns the latest version for specified platform.
   */
  private getLatestVersion(platform: string, indexedVersionInfo: any): string {
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

  /**
   * This method looks for the requested version (partial or complete) in the
   * indexed version information. Based on the input, it iterates through all
   * four numbers in the version string and compares the requested version
   * with the indexed info.
   * If any of the requested version number is missing, it fetches the latest
   * (highest) available version for it.
   */
  private getRequestedUriVersion(
    requestedVersion: string[],
    indexedVersionInfo: any,
    platform: Platform,
    product: Product,
  ): IVersionedUris | undefined {
    let versionMap = indexedVersionInfo;
    const versionArray: string[] = [];

    // iterate through all 4 major, minor, release and patch numbers,
    // and get the matching version from the indexed version map.
    for (let versionIndex = 0; versionIndex < 4; versionIndex++) {
      let version: string;
      if (requestedVersion[versionIndex + 1] == null) {

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

    let uriIndex: IUris | undefined;
    if ((platform in versionMap)) {
      const platformVersionMap = versionMap[platform];
      if (product == Product.deadline) {
        uriIndex = {
          bundle: platformVersionMap.bundle,
          clientInstaller: platformVersionMap.clientInstaller,
          repositoryInstaller: platformVersionMap.repositoryInstaller,
          certificateInstaller: platformVersionMap.certificateInstaller,
        };

      } else { // Product.deadlineDocker
        uriIndex = {
          bundle: platformVersionMap,
        };
      }
    }

    if (uriIndex) {
      return {
        MajorVersion: versionArray[0],
        MinorVersion: versionArray[1],
        ReleaseVersion: versionArray[2],
        PatchVersion: versionArray[3],
        Uris: uriIndex,
      };
    } else {
      return undefined;
    }
  }
}
