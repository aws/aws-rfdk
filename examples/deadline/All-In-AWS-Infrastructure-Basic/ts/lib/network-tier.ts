/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FlowLogDestination,
  FlowLogTrafficType,
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

/**
 * The network tier consists of all constructs that are required for the foundational
 * networking between the various components of the Deadline render farm.
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
   * Initializes a new instance of {@link NetworkTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The stack properties.
   */
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
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
      // VPC flow logs are a security best-practice as they allow us
      // to capture information about the traffic going in and out of
      // the VPC. For more information, see the README for this app.
      flowLogs: {
        'NetworkTierFlowLogs': {
          trafficType: FlowLogTrafficType.ALL,
          destination: FlowLogDestination.toCloudWatchLogs(),
        },
      },
    });

    // TODO - Create a NetworkAcl for your VPC that only allows
    // network traffic required for your render farm. This is a
    // security best-practice to ensure the safety of your farm.
    // The default network ACLs allow all traffic by default,
    // whereas custom network ACLs deny all traffic by default.
    // For more information, see the README for this app.
    //
    // Example code to create a custom network ACL:
    // const acl = new NetworkAcl(this, 'ACL' {
    //   vpc: this.vpc,
    //   subnetSelection: { subnets: this.vpc.publicSubnets }
    // });
    //
    // You can optionally add rules to allow traffic (e.g. SSH):
    // acl.addEntry('SSH', {
    //   cidr: AclCidr.ipv4(/* some-ipv4-address-cidr */),
    //   traffic: AclTraffic.tcpPort(22),
    //   ruleNumber: 1
    // });

    // Add the required VPC Endpoints
    // -------------
    // Subnets to add the VPC endpoints to
    const endpointSubnets: SubnetSelection = { subnetType: SubnetType.PRIVATE };

    // Add interface endpoints
    NetworkTier.INTERFACE_ENDPOINT_SERVICES.forEach((serviceInfo, idx) => {
      this.vpc.addInterfaceEndpoint(`${serviceInfo.name}${idx}`, {
        service: serviceInfo.service,
        subnets: endpointSubnets,
      });
    });

    // Add gateway endpoints
    NetworkTier.GATEWAY_ENDPOINT_SERVICES.forEach(serviceInfo => {
      this.vpc.addGatewayEndpoint(serviceInfo.name, {
        service: serviceInfo.service,
        subnets: [ endpointSubnets ],
      });
    });

    this.dnsZone = new PrivateHostedZone(this, 'DnsZone', {
      vpc: this.vpc,
      zoneName: 'deadline-test.internal',
    });
  }
}
