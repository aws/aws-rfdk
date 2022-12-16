# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import builtins
import typing

from aws_cdk import (
    Stack
)
from aws_cdk.aws_ec2 import (
    GatewayVpcEndpointAwsService,
    InterfaceVpcEndpointAwsService,
    SubnetConfiguration,
    SubnetSelection,
    SubnetType,
    Vpc
)
from aws_cdk.aws_route53 import (
    PrivateHostedZone
)
from constructs import (
    Construct
)
import jsii

from .config import config

_INTERFACE_ENDPOINT_SERVICES = [
    {'name': 'CLOUDWATCH', 'service': InterfaceVpcEndpointAwsService.CLOUDWATCH},
    {'name': 'CLOUDWATCH_EVENTS', 'service': InterfaceVpcEndpointAwsService.CLOUDWATCH_EVENTS},
    {'name': 'CLOUDWATCH_LOGS', 'service': InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS},
    {'name': 'EC2', 'service': InterfaceVpcEndpointAwsService.EC2},
    {'name': 'ECR', 'service': InterfaceVpcEndpointAwsService.ECR},
    {'name': 'ECS', 'service': InterfaceVpcEndpointAwsService.ECS},
    {'name': 'KMS', 'service': InterfaceVpcEndpointAwsService.KMS},
    {'name': 'SECRETS_MANAGER', 'service': InterfaceVpcEndpointAwsService.SECRETS_MANAGER},
    {'name': 'SNS', 'service': InterfaceVpcEndpointAwsService.SNS},
    {'name': 'STS', 'service': InterfaceVpcEndpointAwsService.STS}
]

_GATEWAY_ENDPOINT_SERVICES = [
    {'name': 'S3', 'service': GatewayVpcEndpointAwsService.S3},
    {'name': 'DYNAMODB', 'service': GatewayVpcEndpointAwsService.DYNAMODB}
]


class NetworkTier(Stack):
    """
    The network tier consists of all constructs that are required for the foundational
    networking between the various components of the Deadline render farm.
    """

    @builtins.property # type: ignore
    @jsii.member(jsii_name="availabilityZones")
    def availability_zones(self) -> typing.List[builtins.str]:
        """
        This overrides the availability zones the Stack will use. The zones that we set here are what
        our VPC will use, so adding local zones to this return value will enable us to then deploy
        infrastructure to them.
        """
        return config.availability_zones_standard + config.availability_zones_local

    def __init__(self, scope: Construct, stack_id: str, **kwargs) -> None:
        """
        Initializes a new instance of NetworkTier
        """
        super().__init__(scope, stack_id, **kwargs)

        # We're creating a SubnetSelection with only the standard availability zones to be used to put
        # the NAT gateway in and the VPC interface endpoints, because the local zones do no have
        # these available.
        standard_zone_subnets = SubnetSelection(
            availability_zones=config.availability_zones_standard,
            subnet_type=SubnetType.PUBLIC
        )

        # The VPC that all components of the render farm will be created in. We are using the `availability_zones()`
        # method to override the availability zones that this VPC will use.
        self.vpc = Vpc(
            self,
            'Vpc',
            max_azs=len(self.availability_zones),
            subnet_configuration=[
                SubnetConfiguration(
                    name='Public',
                    subnet_type=SubnetType.PUBLIC,
                    cidr_mask=28
                ),
                SubnetConfiguration(
                    name='Private',
                    subnet_type=SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=18
                )
            ],
            nat_gateway_subnets=standard_zone_subnets
        )

        # Add interface endpoints
        for idx, service_info in enumerate(_INTERFACE_ENDPOINT_SERVICES):
            service_name = service_info['name']
            service = service_info['service']
            self.vpc.add_interface_endpoint(
                service_name,
                service=service,
                subnets=standard_zone_subnets
            )

        # Add gateway endpoints
        for idx, service_info in enumerate(_GATEWAY_ENDPOINT_SERVICES):
            service_name = service_info['name']
            service = service_info['service']
            self.vpc.add_gateway_endpoint(
                service_name,
                service=service,
                subnets=[standard_zone_subnets]
            )

        # Internal DNS zone for the VPC.
        self.dns_zone = PrivateHostedZone(
            self,
            'DnsZone',
            vpc=self.vpc,
            zone_name='deadline-test.internal'
        )
