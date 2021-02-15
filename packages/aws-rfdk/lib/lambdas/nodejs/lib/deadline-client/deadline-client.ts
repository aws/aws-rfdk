/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import * as https from 'https';

/* eslint-disable no-console */

/**
 * Properties for setting up an {@link TLSProps}.
 */
export interface TLSProps {
  /**
   * The content of the CA certificate.
   */
  readonly ca?: string;

  /**
   * The content of the PFX certificate.
   */
  readonly pfx?: string;

  /**
   * The shared passphrase used for a single private key and/or a PFX.
   */
  readonly passphrase?: string;
}

/**
 * Properties for setting up an {@link DeadlineClient}.
 */
export interface DeadlineClientProps {
  /**
   * The IP address or DNS name of the Render Queue.
   */
  readonly host: string;

  /**
   * The port number address of the Render Queue.
   */
  readonly port: number;

  /**
   * The protocol to use when connecting to the Render Queue.
   * Supported values: HTTP, HTTPS
   */
  readonly protocol: string;

  /**
   * The certificate, private key, and root CA certificate if SSL/TLS is used.
   */
  readonly tls?: TLSProps;
}

/**
 * Properties for setting up an {@link RequestOptions}.
 */
interface RequestOptions {
  /**
   * The IP address or DNS name of the Render Queue.
   */
  readonly host: string;

  /**
   * The port Render Queue is listening to.
   */
  readonly port: number;

  /**
   * The agent used for TLS connection.
   */
  agent?: https.Agent;
}

/**
 * The response returned from the requests.
 */
export interface Response {
  /**
   * The data of the response to a request.
   */
  readonly data: any;
  /**
   * The full response obtained from the POST and GET requests.
   */
  readonly fullResponse: http.IncomingMessage;
}

/**
 * Implements a simple client that supports HTTP/HTTPS GET and POST requests.
 * It is intended to be used within Custom Resources that need to send the requests to the Render Queue.
 */
export class DeadlineClient {
  public readonly requestOptions: RequestOptions;
  private protocol: typeof http | typeof https;

  public constructor(props: DeadlineClientProps) {
    this.requestOptions = {
      host: props.host,
      port: props.port,
    };

    if (props.protocol === 'HTTPS') {
      this.protocol = https;

      this.requestOptions.agent = new https.Agent({
        pfx: props.tls?.pfx,
        passphrase: props.tls?.passphrase,
        ca: props.tls?.ca,
      });
    }
    else {
      this.protocol = http;
    }
  }

  /**
   * Perform an HTTP GET request.
   *
   * @param path The resource to request for.
   * @param requestOptions Other request options, including headers, timeout, etc.
   * @param retries The number of retries if received status code 503 Service Temporarily unavailable.
   * @param retryWaitMs The amount of time in milliseconds to wait between the retries.
   */
  public async GetRequest(path: string, requestOptions?: https.RequestOptions, retries: number=3, retryWaitMs=0): Promise<Response> {
    const options = this.FillRequestOptions(path, 'GET', requestOptions);
    return this.performRequestWithRetry(options, retries, retryWaitMs);
  }

  /**
   * Perform an HTTP POST request.
   *
   * @param path The resource to request for.
   * @param data The data (body) of the request that contains the information to be sent.
   * @param requestOptions Other request options, including headers, timeout, etc.
   * @param retries The number of retries if received status code 503 Service Temporarily unavailable.
   * @param retryWaitMs The amount of time in milliseconds to wait between the retries.
   */
  public async PostRequest(path: string, data?: any, requestOptions?: https.RequestOptions, retries: number=3, retryWaitMs=0): Promise<Response> {
    const options = this.FillRequestOptions(path, 'POST', requestOptions);
    return this.performRequestWithRetry(options, retries, retryWaitMs, data ? JSON.stringify(data) : undefined);
  }

  private FillRequestOptions(path: string, method: string, requestOptions?: https.RequestOptions): https.RequestOptions {
    const options: https.RequestOptions = {
      ...requestOptions,
      port: this.requestOptions.port,
      host: this.requestOptions.host,
      agent: this.requestOptions.agent,
      path: path,
      method: method,
    };

    return options;
  }

  private async performRequestWithRetry(options: https.RequestOptions, retriesLeft: number, retryDelayMs: number, data?: string): Promise<Response> {
    return this.performRequest(options, data)
      .catch(async (rejection) => {
        if (rejection.statusCode === 503 && retriesLeft > 0) {
          console.log(`Request failed with ${rejection.statusCode}: ${rejection.statusMessage}. Will retry after ${retryDelayMs} ms.`);
          console.log(`Retries left: ${retriesLeft}`);
          const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
          await delay(retryDelayMs);
          return await this.performRequestWithRetry(options, retriesLeft - 1, retryDelayMs, data);
        }
        else {
          return await Promise.reject(new Error(rejection.statusMessage));
        }
      });
  }

  private async performRequest(options: https.RequestOptions, data?: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const req = this.protocol.request(options, response => {
        const { statusCode } = response;
        if (!statusCode || statusCode >= 300) {
          reject(response);
        }
        else {
          const chunks: any = [];
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });
          response.on('end', () => {
            const stringData = Buffer.concat(chunks).toString();
            const result: Response = {
              data: JSON.parse(stringData),
              fullResponse: response,
            };
            resolve(result);
          });
        }
      });

      if (data) {
        req.write(data);
      }

      req.end();
    });
  }
}
