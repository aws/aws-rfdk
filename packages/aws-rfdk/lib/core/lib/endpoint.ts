/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Token } from 'aws-cdk-lib';
import {
  Connections,
  IConnectable,
  Port,
  Protocol,
} from 'aws-cdk-lib/aws-ec2';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

/**
 * Properties for constructing an {@link Endpoint}
 */
export interface EndpointProps {
  /**
   * The address (either an IP or hostname) of the endpoint.
   */
  readonly address: string;

  /**
   * The port number of the endpoint.
   */
  readonly port: number;

  /**
   * The transport protocol of the endpoint.
   *
   * @default TCP
   */
  readonly protocol?: Protocol;
}

/**
 * Connection endpoint
 *
 * Consists of a combination of hostname, port, and transport protocol.
 */
export class Endpoint {
  /**
   * The minimum port value
   */
  private static readonly MIN_PORT = 1;

  /**
   * The maximum port value
   */
  private static readonly MAX_PORT = 65535;

  /**
   * Determines if a port is valid
   *
   * @param port: The port number
   * @returns boolean whether the port is valid
   */
  private static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= Endpoint.MIN_PORT && port <= Endpoint.MAX_PORT;
  }

  /**
   * The hostname of the endpoint
   */
  public readonly hostname: string;

  /**
   * The port of the endpoint.
   */
  public readonly port: Port;

  /**
   * The port number of the endpoint.
   *
   * This can potentially be a CDK token. If you need to embed the port in a string (e.g. instance user data script),
   * use {@link Endpoint.portAsString}.
   */
  public readonly portNumber: number;

  /**
   * The protocol of the endpoint
   */
  public readonly protocol: Protocol;

  /**
   * The combination of "HOSTNAME:PORT" for this endpoint
   */
  public readonly socketAddress: string;

  /**
   * Constructs an Endpoint instance.
   *
   * @param props The properties for the endpoint
   */
  constructor(props: EndpointProps) {
    const { address, port } = props;
    const protocol = props.protocol ?? Protocol.TCP;

    if (!Token.isUnresolved(port) && !Endpoint.isValidPort(port)) {
      throw new Error(`Port must be an integer between [${Endpoint.MIN_PORT}, ${Endpoint.MAX_PORT}] but got: ${port}`);
    }

    this.hostname = address;
    this.portNumber = port;
    this.protocol = protocol;

    this.port = new Port({
      protocol: this.protocol,
      fromPort: port,
      toPort: port,
      stringRepresentation: this.renderPort(port),
    });

    this.socketAddress = `${address}:${this.portAsString()}`;
  }

  /**
   * Returns the port number as a string representation that can be used for embedding within other strings.
   *
   * This is intended to deal with CDK's token system. Numeric CDK tokens are not expanded when their string
   * representation is embedded in a string. This function returns the port either as an unresolved string token or
   * as a resolved string representation of the port value.
   *
   * @returns {string} An (un)resolved string representation of the endpoint's port number
   */
  public portAsString(): string {
    if (Token.isUnresolved(this.portNumber)) {
      return Token.asString(this.portNumber);
    } else {
      return this.portNumber.toString();
    }
  }

  private renderPort(port: number) {
    return Token.isUnresolved(port) ? '{IndirectPort}' : port.toString();
  }
}

/**
 * Properties for constructing an {@link ApplicationEndpoint}
 */
export interface ApplicationEndpointProps {
  /**
   * The address (either an IP or hostname) of the endpoint.
   */
  readonly address: string;

  /**
   * The port number of the endpoint.
   */
  readonly port: number;

  /**
   * The application layer protocol of the endpoint
   *
   * @default HTTPS
   */
  readonly protocol?: ApplicationProtocol;
}

/**
 * Properties for constructing an {@link ConnectableApplicationEndpoint}
 */
export interface ConnectableApplicationEndpointProps extends ApplicationEndpointProps {
  /**
   * The connection object of the application this endpoint is for.
   */
  readonly connections: Connections;
}

/**
 * An endpoint serving http or https for an application.
 */
export class ApplicationEndpoint extends Endpoint {
  /**
   * The http protocol that this web application listens on.
   */
  public readonly applicationProtocol: ApplicationProtocol;

  /**
   * Constructs a {@link ApplicationEndpoint} instance.
   *
   * @param props The properties for the application endpoint
   */
  constructor(props: ApplicationEndpointProps) {
    super({
      address: props.address,
      port: props.port,
      protocol: Protocol.TCP,
    });
    this.applicationProtocol = props.protocol ?? ApplicationProtocol.HTTPS;
  }
}

/**
 * An endpoint serving http or https for an application.
 */
export class ConnectableApplicationEndpoint extends ApplicationEndpoint implements IConnectable {

  /**
   * Allows specifying security group connections for the application.
   */
  public readonly connections: Connections;

  /**
   * Constructs a {@link ApplicationEndpoint} instance.
   *
   * @param props The properties for the application endpoint
   */
  constructor(props: ConnectableApplicationEndpointProps) {
    super(props);
    this.connections = props.connections;
  }
}
