/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

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
 * The version provider parse index JSON which can be downloaded or loaded from local file
 * and returns URIs for specific product.
 * By default returns the last version of URIs or specified full or partial version.
 * If platform is not defined returns URIs for each platform.
 */
export class VersionProvider {
  private readonly indexFilePath: string|undefined;
  private readonly VALID_VERSION_REGEX = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/;
  constructor(indexFilePath?: string) {
    this.indexFilePath = indexFilePath;
  }

  /**
   * Returns URIs for specified product
   *
   * @param resourceProperties
   */
  public async getVersionUris(resourceProperties: IVersionProviderProperties): Promise<Map<Platform, IVersionedUris>> {
    /* istanbul ignore next */
    const indexJson = this.indexFilePath ? this.readInstallersIndex() : await this.downloadInstallerIndex();

    const productSection = indexJson[resourceProperties.product];

    if (!productSection) {
      throw new Error(`Information about product ${resourceProperties.product} can't be found`);
    }

    let installers = new Map();
    if (resourceProperties.platform) {
      const versionedUris = await this.getUrisForPlatform(
        resourceProperties.product,
        productSection,
        resourceProperties.platform,
        resourceProperties.versionString);

      if (versionedUris) {
        installers.set(resourceProperties.platform, versionedUris);
      }
    } else {
      Object.values(Platform).forEach(async p => {
        const versionedUris = await this.getUrisForPlatform(
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

  public implementsIVersionProviderProperties(value: any): boolean {
    if (!value || typeof(value) !== 'object') { return false; }

    if (!value.product || !Object.values(Product).includes(value.product)) {
      return false;
    }

    if (value.versionString) {
      if (null === this.parseVersionString(value.versionString))  { return false; }
    }

    if (value.platform) {
      if (!Object.values(Platform).includes(value.platform.toLowerCase()))  { return false; }
    }

    return true;
  }

  /* istanbul ignore next */ // @ts-ignore
  private async downloadInstallerIndex() {
    const productionInfoURL = 'https://downloads.thinkboxsoftware.com/version_info.json';

    const parsedUrl = url.parse(productionInfoURL);

    const options = {
      host: parsedUrl.hostname,
      path: parsedUrl.path,
    };

    return new Promise((resolve, reject) => {
      https.get(options, (res: http.IncomingMessage) => {
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

  private parseVersionString(versionString: string): RegExpExecArray | null {
    return this.VALID_VERSION_REGEX.exec(versionString);
  }

  /**
   * This method returns IVersionedUris for specific platform
   *
   * @param product
   * @param productSection
   * @param platform
   * @param version
   */
  private async getUrisForPlatform(
    product: Product,
    productSection: any,
    platform: Platform,
    version?: string,
  ): Promise<IVersionedUris | undefined> {
    const versionString: string = version ? version : this.getLatestVersion(platform, productSection);

    const requestedVersion = this.parseVersionString( versionString );

    // Based on the requested version, fetches the latest patch and its installer file paths.
    return this.getRequestedUriVersion(
      requestedVersion,
      productSection.versions,
      platform,
      product,
    );
  }

  /**
   * This method returns the latest version for specified platform.
   *
   * @param platform
   * @param indexedVersionInfo
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
   *
   * @param requestedVersion
   * @param indexedVersionInfo
   */
  private getRequestedUriVersion(
    requestedVersion: RegExpExecArray | null,
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
      if (requestedVersion?.[versionIndex + 1] == null) {

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
      if (product == Product.deadline) {
        const platformVersion = versionMap[platform];
        uriIndex = {
          bundle: platformVersion.bundle,
          clientInstaller: versionMap[platform].clientInstaller,
          repositoryInstaller: versionMap[platform].repositoryInstaller,
          certificateInstaller: versionMap[platform].certificateInstaller,
        };

      } else { // Product.deadlineDocker
        uriIndex = {
          bundle: versionMap[platform],
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
