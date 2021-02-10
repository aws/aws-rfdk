/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GatewayVpcEndpointAwsService,
  IInterfaceVpcEndpointService,
  IGatewayVpcEndpointService,
  InterfaceVpcEndpointAwsService,
  IVpc,
  SubnetSelection,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  PrivateHostedZone,
} from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';

import { config } from '../bin/config';

/**
 * The network tier is where we define our VPC that will host all the other components that will be
 * deployed. Adding our local zones to this VPC will allow us to use them for our worker fleets in
 * a dependent stack.
 */
export class NetworkTier extends cdk.Stack {
  /**
   * The VPC that all components of the render farm will be created in.
   */
  public readonly vpc: IVpc;

  /**
   * Internal DNS zone for the VPC.
   */
  public readonly dnsZone: PrivateHostedZone;

  /**
   * The interface endpoints for the AWS services used in this app.
   */
  private static readonly INTERFACE_ENDPOINT_SERVICES: { name: string, service: IInterfaceVpcEndpointService }[] = [
    { name: 'CLOUDWATCH', service: InterfaceVpcEndpointAwsService.CLOUDWATCH },
    { name: 'CLOUDWATCH_EVENTS', service: InterfaceVpcEndpointAwsService.CLOUDWATCH_EVENTS },
    { name: 'CLOUDWATCH_LOGS', service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS },
    { name: 'EC2', service: InterfaceVpcEndpointAwsService.EC2 },
    { name: 'ECR', service: InterfaceVpcEndpointAwsService.ECR },
    { name: 'ECS', service: InterfaceVpcEndpointAwsService.ECS },
    { name: 'KMS', service: InterfaceVpcEndpointAwsService.KMS },
    { name: 'SECRETS_MANAGER', service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER },
    { name: 'SNS', service: InterfaceVpcEndpointAwsService.SNS },
    { name: 'STS', service: InterfaceVpcEndpointAwsService.STS },
  ];

  /**
   * The gateway endpoints for the AWS services used in this app.
   */
  private static readonly GATEWAY_ENDPOINT_SERVICES: { name: string, service: IGatewayVpcEndpointService }[] = [
    { name: 'S3', service: GatewayVpcEndpointAwsService.S3 },
    { name: 'DYNAMODB', service: GatewayVpcEndpointAwsService.DYNAMODB },
  ];

  /**
   * This overrides the availability zones the Stack will use. The zones that we set here are what
   * our VPC will use, so adding local zones to this return value will enable us to then deploy
   * infrastructure to them.
   */
  public get availabilityZones(): string[] {
    return config.availabilityZonesStandard.concat(config.availabilityZonesLocal);
  }

  /**
   * Initializes a new instance of {@link NetworkTier}.
   */
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // We're creating a SubnetSelection with only the standard availability zones to be
    // used to put the NAT gateway in and the VPC endpoints, because the local zones do no
    // have these available.
    const subnets: SubnetSelection = {
      availabilityZones: config.availabilityZonesStandard,
      subnetType: SubnetType.PUBLIC,
    };

    this.vpc = new Vpc(this, 'Vpc', {
      maxAzs: this.availabilityZones.length,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 28,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE,
          cidrMask: 18, // 16,382 IP addresses
        },
      ],
      natGatewaySubnets: subnets,
    });

    NetworkTier.INTERFACE_ENDPOINT_SERVICES.forEach((serviceInfo, idx) => {
      this.vpc.addInterfaceEndpoint(`${serviceInfo.name}${idx}`, {
        service: serviceInfo.service,
        subnets,
      });
    });
    NetworkTier.GATEWAY_ENDPOINT_SERVICES.forEach(serviceInfo => {
      this.vpc.addGatewayEndpoint(serviceInfo.name, {
        service: serviceInfo.service,
        subnets: [ subnets ],
      });
    });

    this.dnsZone = new PrivateHostedZone(this, 'DnsZone', {
      vpc: this.vpc,
      zoneName: 'deadline-test.internal',
    });
  }
}
