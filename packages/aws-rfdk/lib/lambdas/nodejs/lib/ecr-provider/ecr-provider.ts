/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';

/**
 * The schema of the AWS Thinkbox Docker image index
 */
interface ThinkboxDockerImageIndex {
  /**
   * Information about the AWS Thinkbox Docker registry
   */
  readonly registry: {
    /**
     * The base URI of the AWS Thinkbox Docker registry
     */
    readonly uri: string;
  };

  /**
   * Catalog of products for which AWS Thinkbox publishes Docker images
   */
  readonly products: {
    /**
     * Deadline images
     */
    readonly deadline: {
      /**
       * The URI namespace appended to the AWS Thinkbox Docker registry URI where
       * Docker images can be pulled.
       *
       * Image Docker URIs can be computed as:
       *
       *     <REGISTRY_URI><DEADLINE_NAMESPACE><RECIPE_NAME>
       */
      readonly namespace: string;
    };
  };
}

/**
 * The version provider parses a JSON file containing references to ECRs that serve Thinkbox's Deadline Docker images.
 * It can be downloaded or loaded from local file and returns the ECR ARN prefix.
 */
export class ThinkboxEcrProvider {
  /**
   * The URL to obtain the ECR index from.
   */
  private static readonly ECR_INDEX_URL = 'https://downloads.thinkboxsoftware.com/thinkbox_ecr.json';

  private indexJsonPromise?: Promise<ThinkboxDockerImageIndex>;

  constructor(private readonly indexPath?: string) {}

  private get indexJson() {
    if (!this.indexJsonPromise) {
      this.indexJsonPromise = new Promise<string>((resolve, reject) => {
        try {
          if (this.indexPath) {
            return resolve(this.readEcrIndex(this.indexPath));
          }
          else {
            // return resolve(this.getMockEcrIndex());
            resolve(this.getEcrIndex());
          }
        }
        catch (e) {
          return reject(e);
        }
      }).then((json: string) => {
        // convert the response to a json object and return.
        let data: any;
        try {
          data = JSON.parse(json);
        }
        catch (e) {
          throw new Error(`ECR index file contains invalid JSON: "${e}"`);
        }

        if (this.verifyThinkboxDockerImageIndex(data)) {
          return data;
        }
        else {
          throw new Error('This should be a dead code path');
        }
      });
    }
    return this.indexJsonPromise;
  }

  private verifyThinkboxDockerImageIndex(index: any): index is ThinkboxDockerImageIndex {
    function expectObject(key: string, value: any) {
      const valueType = typeof value;
      if (valueType != 'object') {
        throw new Error(`expected ${key} to be an object but got ${valueType}`);
      }

      if (Array.isArray(index)) {
        throw new Error(`expected ${key} to be an object but got array`);
      }
    }

    function expectString(key: string, value: any) {
      const valueType = typeof value;
      if (valueType != 'string') {
        throw new Error(`expected ${key} to be a string but got ${valueType}`);
      }
    }

    expectObject('index', index);
    expectObject('index.registry', index.registry);
    expectString('index.registry.uri', index.registry.uri);
    expectObject('index.products', index.products);
    expectObject('index.products.deadline', index.products.deadline);
    expectString('index.products.deadline.namespace', index.products.deadline.namespace);

    return true;
  }

  /**
   * Gets the global ECR base URI for Thinkbox published Deadline Docker images.
   */
  public async getGlobalEcrBaseURI(): Promise<string> {
    const indexJson = await this.indexJson;

    const globalEcrBaseURI = `${indexJson.registry.uri}/${indexJson.products.deadline.namespace}`;
    if (globalEcrBaseURI === undefined) {
      throw new Error('No global ECR');
    }
    if (typeof(globalEcrBaseURI) != 'string') {
      throw new Error(`Unexpected type for global base ECR URI: "${typeof(globalEcrBaseURI)}`);
    }

    return globalEcrBaseURI;
  }

  /**
   * Downloads and parses the ECR index.
   *
   * Returns a promise that is resolved with a JSON-parsed object containing the index.
   */
  private async getEcrIndex(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const request = https.get(ThinkboxEcrProvider.ECR_INDEX_URL, (res: IncomingMessage) => {
        let json = '';

        res.on('data', (chunk: string) => {
          // keep appending the response chunks until we get 'end' event.
          json += chunk;
        });

        res.on('end', () => {
          // complete response is available here:
          if (res.statusCode === 200) {
            resolve(json);
          } else {
            reject(new Error(`Expected status code 200, but got ${res.statusCode}`));
          }
        });
      });

      request.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * This method reads the ECR index from a file and returns a parsed JSON object.
   *
   * @param indexFilePath The path to the ECR index file
   */
  private readEcrIndex(indexFilePath: string): string {
    if (!fs.existsSync(indexFilePath)) {
      throw new Error(`File "${indexFilePath}" was not found`);
    }
    const json = fs.readFileSync(indexFilePath, 'utf8');

    return json;
  }
}
