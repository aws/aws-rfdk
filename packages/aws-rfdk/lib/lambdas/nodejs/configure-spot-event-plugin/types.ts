/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface for communication between Lambda and ConfigureSpotEventPlugin construct.
 * All the properties correspond to SpotEventPluginSettings from '../../../deadline/lib/configure-spot-event-plugin',
 * but the types may differ.
 */
export interface InternalSpotEventPluginSettings {
  readonly awsInstanceStatus: string;
  readonly deleteEC2SpotInterruptedWorkers: boolean;
  readonly deleteSEPTerminatedWorkers: boolean;
  readonly idleShutdown: number;
  readonly loggingLevel: string;
  readonly preJobTaskMode: string;
  readonly region: string;
  readonly enableResourceTracker: boolean;
  readonly maximumInstancesStartedPerCycle: number;
  readonly state: string;
  readonly strictHardCap: boolean;
}

/**
 * Values required for establishing a connection to a TLS-enabled Render Queue.
 */
export interface ConnectionOptions {
  /**
   * Fully qualified domain name of the Render Queue.
   */
  readonly hostname: string;

  /**
   * Port on the Render Queue to connect to.
   */
  readonly port: string;

  /**
   * Protocol used to connect to the Render Queue.
   * Allowed values: 'HTTP' and 'HTTPS'.
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
   * Info for connecting to the Render Queue.
   */
  readonly connection: ConnectionOptions;

  /**
   * The Spot Fleet Request Configurations.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#example-spot-fleet-request-configurations
   */
  readonly spotFleetRequestConfigurations?: object;

  /**
   * The Spot Event Plugin settings.
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/event-spot.html#event-plugin-configuration-options
   */
  readonly spotPluginConfigurations?: InternalSpotEventPluginSettings;
}