/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import {
  Connections,
  IConnectable,
  Port,
  Protocol,
  SecurityGroup,
  Vpc,
} from '@aws-cdk/aws-ec2';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  Stack,
  Token,
} from '@aws-cdk/core';

import {
  ApplicationEndpoint,
  ConnectableApplicationEndpoint,
  Endpoint,
} from '../lib';

// A numeric CDK token (see: https://docs.aws.amazon.com/cdk/latest/guide/tokens.html#tokens_number)
const CDK_NUMERIC_TOKEN = -1.8881545897087626e+289;

function escapeTokenRegex(s: string): string {
  // A CDK Token looks like: ${Token[TOKEN.12]}
  // This contains the regex special characters: $, {, }, [, and ]
  // Escape those for use in a regex.
  return s.replace(/[.${}[\]]/g, '\\$&');
}

describe('Endpoint', () => {
  test('accepts tokens for the port value', () => {
    // GIVEN
    const token = CDK_NUMERIC_TOKEN;

    // WHEN
    const endpoint = new Endpoint({
      address: '127.0.0.1',
      port: token,
    });

    // THEN
    expect(endpoint.port.toRuleJson()).toEqual(expect.objectContaining({
      fromPort: token,
      toPort: token,
      ipProtocol: 'tcp',
    }));
    expect(endpoint.socketAddress).toEqual(expect.stringMatching(new RegExp(escapeTokenRegex('127.0.0.1:${Token[TOKEN.\\d+]}'))));
  });

  test('accepts valid port string numbers', () => {
    // GIVEN
    for (const port of [1, 50, 65535]) {
      // WHEN
      const endpoint = new Endpoint({
        address: '127.0.0.1',
        port,
      });

      // THEN
      expect(endpoint.port.toRuleJson()).toEqual(expect.objectContaining({
        fromPort: port,
        toPort: port,
        ipProtocol: 'tcp',
      }));
      expect(endpoint.socketAddress).toBe(`127.0.0.1:${port}`);
    }
  });

  test('throws an exception for port numbers below the minimum', () => {
    // GIVEN
    const port = 0;

    // WHEN
    function createInvalidEnpoint() {
      new Endpoint({
        address: '127.0.0.1',
        port,
      });
    }

    // THEN
    expect(createInvalidEnpoint).toThrow();
  });

  test('throws an exception for port numbers above the maximum', () => {
    // GIVEN
    const port = 65536;

    // WHEN
    function createInvalidEnpoint() {
      new Endpoint({
        address: '127.0.0.1',
        port,
      });
    }

    // THEN
    expect(createInvalidEnpoint).toThrow();
  });

  test('throws an exception for floating-point port numbers', () => {
    // GIVEN
    const port = 1.5;

    // WHEN
    function createInvalidEnpoint() {
      new Endpoint({
        address: '127.0.0.1',
        port,
      });
    }

    // THEN
    expect(createInvalidEnpoint).toThrow();
  });

  describe('.portAsString()', () => {
    test('converts port tokens to string tokens', () => {
      // GIVEN
      const port = CDK_NUMERIC_TOKEN;
      const endpoint = new Endpoint({
        address: '127.0.0.1',
        port,
      });

      // WHEN
      const result = endpoint.portAsString();

      // THEN
      // Should return a string token
      expect(Token.isUnresolved(result)).toBeTruthy();
      // It should not just be the string representation of the numeric token
      expect(result).not.toBe(port.toString());
    });

    test('converts resolved port numbers to string representation', () => {
      // GIVEN
      const port = 1500;
      const endpoint = new Endpoint({
        address: '127.0.0.1',
        port,
      });

      // WHEN
      const result = endpoint.portAsString();

      // THEN
      expect(result).toBe(port.toString());
    });
  });
});

describe('ApplicationEndpoint', () => {
  test('uses TCP transport', () => {
    // WHEN
    const endpoint = new ApplicationEndpoint({
      address: '127.0.0.1',
      port: 80,
    });

    // THEN
    expect(endpoint.protocol).toBe(Protocol.TCP);
  });

  test('defaults to https', () => {
    // WHEN
    const endpoint = new ApplicationEndpoint({
      address: '127.0.0.1',
      port: 80,
    });

    // THEN
    expect(endpoint.applicationProtocol).toBe(ApplicationProtocol.HTTPS);
  });

  test.each([
    [ApplicationProtocol.HTTP],
    [ApplicationProtocol.HTTPS],
  ])('sets protocol to %p', (protocol: ApplicationProtocol) => {
    // WHEN
    const endpoint = new ApplicationEndpoint({
      address: '127.0.0.1',
      port: 80,
      protocol,
    });

    // THEN
    expect(endpoint.applicationProtocol).toBe(protocol);
  });
});

describe('ConnectableApplicationEndpoint', () => {
  test('Is connectable', () => {
    // WHEN
    const stack = new Stack();
    const vpc = new Vpc(stack, 'VPC');
    const sg1 = new SecurityGroup(stack, 'SomeSecurityGroup', { vpc, allowAllOutbound: false });
    const somethingConnectable = new SomethingConnectable(new Connections({ securityGroups: [sg1] }));

    const securityGroup = SecurityGroup.fromSecurityGroupId(stack, 'ImportedSG', 'sg-12345');

    const endpoint = new ConnectableApplicationEndpoint({
      address: '127.0.0.1',
      port: 80,
      connections: new Connections({securityGroups: [securityGroup]}),
    });

    // WHEN
    somethingConnectable.connections.allowTo(endpoint, Port.tcp(80), 'Connecting to endpoint');

    // THEN
    expectCDK(stack).to(haveResource('AWS::EC2::SecurityGroupIngress'));
  });
});

class SomethingConnectable implements IConnectable {
  constructor(public readonly connections: Connections) {
  }
}