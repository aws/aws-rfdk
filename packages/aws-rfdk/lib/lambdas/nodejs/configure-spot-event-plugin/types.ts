/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpotEventPluginSettings } from '../../../deadline/lib/configure-spot-event-plugin';
import { SpotFleetRequestConfiguration } from '../../../deadline/lib/spot-event-plugin-fleet-ref';

/**
 * Values required for establishing a connection to a TLS-enabled Render Queue.
 */
export interface ConnectionOptions {
  /**
   * FQDN of the host to connect to.
   */
  readonly hostname: string;

  /**
   * Port on the host.
   */
  readonly port: string;

  /**
   * Protocol used to connect to the host.
   */
  readonly protocol: string;

  /**
   * The ARN of the CA certificate stored in the SecretsManager.
   */
  readonly caCertificateArn?: string;
}

/**
 * The input to this Custom Resource
 */
export interface SEPConfiguratorResourceProps {
  /**
   * Connection info for logging into the server.
   */
  readonly connection: ConnectionOptions;

  /**
   * The Spot Fleet Request Configurations.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html?highlight=spot%20even%20plugin#example-spot-fleet-request-configurations
   */
  readonly spotFleetRequestConfigurations?: SpotFleetRequestConfiguration;

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html?highlight=spot%20even%20plugin#event-plugin-configuration-options
   */
  readonly spotPluginConfigurations?: SpotEventPluginSettings;
}