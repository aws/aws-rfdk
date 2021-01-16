/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';

/**
 * The version provider parses a JSON file containing references to ECRs that serve Thinkbox's Deadline Docker images.
 * It can be downloaded or loaded from local file and returns the ECR ARN prefix.
 */
export class ThinkboxEcrProvider {
  /**
   * The URL to obtain the ECR index from.
   */
  private static readonly ECR_INDEX_URL = 'https://downloads.thinkboxsoftware.com/deadline_ecr.json';

  private indexJsonPromise?: Promise<any>

  constructor(private readonly indexPath?: string) {}

  private get indexJson() {
    if (!this.indexJsonPromise) {
      this.indexJsonPromise = new Promise<any>((resolve, reject) => {
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
      }).then((json) => {
        // convert the response to a json object and return.
        let data: any;
        try {
          data = JSON.parse(json);
        }
        catch (e) {
          throw new Error(`ECR index file contains invalid JSON: "${e}"`);
        }
        return data;
      });
    }
    return this.indexJsonPromise;
  }

  /**
   * Gets the global ECR base URI for Thinkbox published Deadline Docker images.
   */
  public async getGlobalEcrBaseURI() {
    const indexJson = await this.indexJson;

    const globalEcrBaseURI = indexJson.global;
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
  private async getEcrIndex() {
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
