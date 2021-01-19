/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import * as https from 'https';

/**
 * Properties for setting up an {@link TLSProps}.
 */
export interface TLSProps {
  /**
   * The ARN of the CA certificate.
   */
  readonly ca?: string;

  /**
   * The ARN of the PFX certificate.
   */
  readonly pfx?: string;

  /**
   * The ARN of the shared passphrase used for a single private key and/or a PFX.
   */
  readonly passphrase?: string;
}

/**
 * Properties for setting up an {@link DeadlineClientProps}.
 */
export interface DeadlineClientProps {
  /**
   * The IP address or DNS name of the Remote Connection Server
   */
  readonly host: string;

  /**
   * The port number address of the Remote Connection Server
   */
  readonly port: number;

  /**
   * The certificate, private key, and root CA certificate if SSL/TLS is used
   */
  readonly tls?: TLSProps;
}

/**
 * Properties for setting up an {@link RequestOptions}.
 */
interface RequestOptions {
  /**
   * The IP address or DNS name of the Remote Connection Server
   */
  readonly host: string;

  /**
   * The port Remote Connection Server is listening to
   */
  readonly port: number;

  /**
   * The agent used for TLS connection
   */
  httpsAgent?: https.Agent;
}

interface Response {
  data: object,
  fullResponse: http.IncomingMessage,
}

export class DeadlineClient {
  public readonly requestOptions: RequestOptions;
  private protocol: typeof http | typeof https;

  public constructor(props: DeadlineClientProps) {
    this.requestOptions = {
      host: props.host,
      port: props.port,
    };

    if (props.tls) {
      this.protocol = https;

      const httpsAgent = new https.Agent({
        pfx: props.tls.pfx,
        passphrase: props.tls.passphrase,
        ca: props.tls.ca,
      });
      this.requestOptions.httpsAgent = httpsAgent;
    }
    else {
      this.protocol = http;
    }
  }

  public async GetRequest(path: string, requestOptions?: https.RequestOptions): Promise<Response> {
    let options = this.FillRequestOptions(path, requestOptions);
    options.method = 'GET';

    return this.performRequest(options);
  }

  public async PostRequest(path: string, data?: any, requestOptions?: https.RequestOptions): Promise<Response> {
    let options = this.FillRequestOptions(path, requestOptions);
    options.method = 'POST';

    return this.performRequest(options, data ? JSON.stringify(data) : undefined);
  }

  private FillRequestOptions(path: string, requestOptions?: https.RequestOptions): https.RequestOptions {
    let options: https.RequestOptions = requestOptions ?? {};

    options.port = this.requestOptions.port;
    options.host = this.requestOptions.host;
    options.agent = this.requestOptions.httpsAgent;

    options.path = path;

    return options;
  }

  private async performRequest(options: https.RequestOptions, data?: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const req = this.protocol.request(options, response => {
        const { statusCode } = response;
        if (!statusCode || statusCode >= 300) {
          reject(
            new Error(response.statusMessage),
          );
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
