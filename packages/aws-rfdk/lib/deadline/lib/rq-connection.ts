/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { Stack } from 'aws-cdk-lib';
import { OperatingSystemType } from 'aws-cdk-lib/aws-ec2';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';


import { ConnectableApplicationEndpoint } from '../../core';
import { IHost } from './host-ref';
import {
  ECSConnectOptions,
  InstanceConnectOptions,
} from './render-queue-ref';

/**
 * The basic options that all connections require
 */
export interface BaseConnectionOptions {
  /**
   * The endpoint of the Renderqueue we are connecting to.
   */
  readonly endpoint: ConnectableApplicationEndpoint;
}

/**
 * Options used for creating an HTTPS Connection object
 */
export interface HTTPSConnectionOptions extends BaseConnectionOptions {
  /**
   * The CACert that signed the Cert the Render Queue uses.
   */
  readonly caCert: ISecret;
}

interface ConnectionScriptArguments {
  /**
   * The address of the Render Queue
   */
  readonly address: string;

  /**
   * The ARN to the AWS Secrets Manager secret containing the X509 CA Certificate in PEM format.
   */
  readonly tlsCaArn?: string;

  /**
   * Whether to restart the Deadline launcher after configuring the Render Queue connection.
   */
  readonly restartLauncher?: boolean;
}

/**
 * Helper class for connecting Clients to a render queue
 */
export abstract class RenderQueueConnection {
  /**
   * Create a RQ Connection for http traffic
   */
  public static forHttp(options: BaseConnectionOptions): RenderQueueConnection {
    return new HTTPConnection(options);
  }

  /**
   * Create a RQ Connection for https traffic
   */
  public static forHttps(options: HTTPSConnectionOptions): RenderQueueConnection {
    return new HTTPSConnection(options);
  }

  /**
   * Configures an ECS cluster to be able to connect to a RenderQueue
   * @returns An environment mapping that is used to configure the Docker Images
   */
  public abstract configureClientECS(params: ECSConnectOptions): { [name: string]: string };

  /**
   * Configure an Instance/Autoscaling group to connect to a RenderQueue
   */
  public abstract configureClientInstance(params: InstanceConnectOptions): void;

  /**
   * Fetch the instance configuration python script
   * @param stack The stack that the asset should be created in
   */
  protected connectionAssetSingleton(stack: Stack) {
    const uuid = '3be2203f-fea1-4143-bc09-7ef079b4299c';
    const uniqueId = 'RenderQueueConnectionAsset' + uuid.replace(/[-]/g, '');

    return (stack.node.tryFindChild(uniqueId) as Asset) ?? new Asset(stack, uniqueId, {
      path: path.join(__dirname, '..', 'scripts', 'python', 'client-rq-connection.py'),
    });
  }

  /**
   * Executes connection asset singleton wth a given list of arguments
   */
  protected ExecuteConnectionAsset(host: IHost, args: ConnectionScriptArguments) {

    const hostStack = Stack.of(host);
    const connectionAsset = this.connectionAssetSingleton(hostStack);
    connectionAsset.grantRead(host);

    const configureScriptPath = host.userData.addS3DownloadCommand({
      bucket: connectionAsset.bucket,
      bucketKey: connectionAsset.s3ObjectKey,
    });

    const dlExtraCommands = [];
    if (args.tlsCaArn) {
      dlExtraCommands.push( '--tls-ca', `"${args.tlsCaArn}"` );
    }
    if ( host.osType === OperatingSystemType.LINUX ) {

      host.userData.addCommands(
        'if [ -f "/etc/profile.d/deadlineclient.sh" ]; then',
        '  source "/etc/profile.d/deadlineclient.sh"',
        'fi',
        `"\${DEADLINE_PATH}/deadlinecommand" -executeScriptNoGui "${configureScriptPath}" --render-queue "${args.address}" ${dlExtraCommands.join(' ')}`,
        // Cleanup
        `rm -f "${configureScriptPath}"`,
      );
      if (args.restartLauncher ?? true) {
        host.userData.addCommands(
          'if service --status-all | grep -q "Deadline 10 Launcher"; then',
          '  service deadline10launcher restart',
          'fi',
        );
      }
    } else if ( host.osType === OperatingSystemType.WINDOWS ) {
      host.userData.addCommands(
        '$ErrorActionPreference = "Stop"',
        '$DEADLINE_PATH = (get-item env:"DEADLINE_PATH").Value',
        `& "$DEADLINE_PATH/deadlinecommand.exe" -executeScriptNoGui "${configureScriptPath}" --render-queue "${args.address}" ${dlExtraCommands.join(' ')} 2>&1`,
        `Remove-Item -Path "${configureScriptPath}"`,
      );
      if (args.restartLauncher ?? true) {
        host.userData.addCommands(
          'If (Get-Service "deadline10launcherservice" -ErrorAction SilentlyContinue) {',
          '  Restart-Service "deadline10launcherservice"',
          '} Else {',
          '  & "$DEADLINE_PATH/deadlinelauncher.exe" -shutdownall 2>&1',
          '  & "$DEADLINE_PATH/deadlinelauncher.exe" -nogui 2>&1',
          '}',
        );
      }
    }
  }

}

/**
 * Specialization of {@link RenderQueueConnection} for HTTP Connections
 */
class HTTPConnection extends RenderQueueConnection {

  constructor(private readonly config: BaseConnectionOptions ) {
    super();
  }

  public configureClientECS(params: ECSConnectOptions): { [name: string]: string } {

    params.hosts.forEach(host => {
      host.connections.allowToDefaultPort(this.config.endpoint);
    });

    return {
      RENDER_QUEUE_URI: `http://${this.config.endpoint.socketAddress}`,
    };
  }

  public configureClientInstance(params: InstanceConnectOptions) {
    params.host.connections.allowToDefaultPort(this.config.endpoint);

    this.ExecuteConnectionAsset(
      params.host,
      {
        address: `http://${this.config.endpoint.socketAddress}`,
        restartLauncher: params.restartLauncher,
      },
    );
  }
}

/**
 * Specialization of {@link RenderQueueConnection} for HTTPS Connections
 */
class HTTPSConnection extends RenderQueueConnection {

  constructor(private readonly config: HTTPSConnectionOptions ) {
    super();
  }

  public configureClientECS(params: ECSConnectOptions): { [name: string]: string } {

    params.hosts.forEach(host => {
      host.connections.allowToDefaultPort(this.config.endpoint);
    });

    this.config.caCert.grantRead(params.grantee);

    return {
      RENDER_QUEUE_URI: `https://${this.config.endpoint.socketAddress}`,
      RENDER_QUEUE_TLS_CA_CERT_URI: this.config.caCert.secretArn,
    };
  }

  public configureClientInstance(params: InstanceConnectOptions) {
    params.host.connections.allowToDefaultPort(this.config.endpoint);
    this.config.caCert.grantRead(params.host);

    this.ExecuteConnectionAsset(
      params.host,
      {
        address: `https://${this.config.endpoint.socketAddress}`,
        tlsCaArn: this.config.caCert.secretArn,
        restartLauncher: params.restartLauncher,
      },
    );

  }
}
