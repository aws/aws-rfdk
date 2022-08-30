# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from aws_cdk import (
    Stack,
)
from aws_cdk.aws_ec2 import (
    FlowLogDestination,
    FlowLogTrafficType,
    GatewayVpcEndpointAwsService,
    InterfaceVpcEndpointAwsService,
    Vpc,
    SubnetSelection,
    SubnetType
)
from aws_cdk.aws_route53 import (
    PrivateHostedZone
)
from constructs import (
    Construct
)

from . import subnets


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

    def __init__(self, scope: Construct, stack_id: str, **kwargs) -> None:
        """
        Initializes a new instance of NetworkTier
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param kwargs: The stack properties.
        """
        super().__init__(scope, stack_id, **kwargs)

        # The VPC that all components of the render farm will be created in.
        self.vpc = Vpc(
            self,
            'Vpc',
            max_azs=2,
            subnet_configuration=[
                # Subnets for undistinguished render farm back-end infrastructure
                subnets.INFRASTRUCTURE,
                # Subnets for publicly accessible infrastructure
                subnets.PUBLIC,
                # Subnets for the Render Queue Application Load Balancer (ALB).
                #
                # It is considered good practice to put a load blanacer in dedicated subnets. Additionally, the subnets
                # must have a CIDR block with a bitmask of at least /27 and at least 8 free IP addresses per subnet.
                # ALBs can scale up to a maximum of 100 IP addresses distributed across all subnets. Assuming only 2 AZs
                # (the minimum) we should have 50 IPs per subnet = CIDR mask of /26
                #
                # See:
                # - https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer
                # - https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/lib/deadline/README.md#render-queue-subnet-placement
                subnets.RENDER_QUEUE_ALB,
                # Subnets for Usage-Based Licensing
                subnets.USAGE_BASED_LICENSING,
                # Subnets for the Worker instances
                subnets.WORKERS
            ]
        )
        # VPC flow logs are a security best-practice as they allow us
        # to capture information about the traffic going in and out of
        # the VPC. For more information, see the README for this app.
        self.vpc.add_flow_log(
            'NetworkTierFlowLogs',
            destination=FlowLogDestination.to_cloud_watch_logs(),
            traffic_type=FlowLogTrafficType.ALL
        )

        # TODO - Create a NetworkAcl for your VPC that only allows
        # network traffic required for your render farm. This is a
        # security best-practice to ensure the safety of your farm.
        # The default network ACLs allow all traffic by default,
        # whereas custom network ACLs deny all traffic by default.
        # For more information, see the README for this app.
        #
        # Example code to create a custom network ACL:
        # acl = NetworkAcl(
        #     self,
        #     'ACL',
        #     vpc=self.vpc,
        #     subnet_selection=SubnetSelection(
        #         subnets=self.vpc.public_subnets
        #     )
        # )
        #
        # You can optionally add rules to allow traffic (e.g. SSH):
        # acl.add_entry(
        #     'SSH',
        #     cidr=AclCidr.ipv4(
        #         # some-ipv4-address-cidr
        #     ),
        #     traffic=AclTraffic.tcp_port(22),
        #     rule_number=1
        # )
        endpoint_subnets = SubnetSelection(subnet_type=SubnetType.PRIVATE_WITH_NAT)

        # Add interface endpoints
        for idx, service_info in enumerate(_INTERFACE_ENDPOINT_SERVICES):
            service_name = service_info['name']
            service = service_info['service']
            self.vpc.add_interface_endpoint(
                f'{service_name}{idx}',
                service=service,
                subnets=endpoint_subnets
            )

        # Add gateway endpoints
        for idx, service_info in enumerate(_GATEWAY_ENDPOINT_SERVICES):
            service_name = service_info['name']
            service = service_info['service']
            self.vpc.add_gateway_endpoint(
                service_name,
                service=service,
                subnets=[endpoint_subnets]
            )

        # Internal DNS zone for the VPC.
        self.dns_zone = PrivateHostedZone(
            self,
            'DnsZone',
            vpc=self.vpc,
            zone_name='deadline-test.internal'
        )
