# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from aws_cdk.aws_ec2 import SubnetConfiguration, SubnetType


# Subnets for undistinguished render farm back-end infrastructure
INFRASTRUCTURE = SubnetConfiguration(
    name='Infrastructure',
    subnet_type=SubnetType.PRIVATE_WITH_NAT,
    # 1,022 IP addresses
    cidr_mask=22
)

# Subnets for publicly accessible infrastructure
PUBLIC = SubnetConfiguration(
    name='Public',
    subnet_type=SubnetType.PUBLIC,
    # 14 IP addresses. We only require one ENI per internet gateway per AZ, but leave some extra room
    # should there be a need for externally accessible ENIs
    cidr_mask=28
)

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
RENDER_QUEUE_ALB = SubnetConfiguration(
    name='RenderQueueALB',
    subnet_type=SubnetType.PRIVATE_WITH_NAT,
    # 62 IP addresses
    cidr_mask=26
)

# Subnets for the Usage-Based Licensing
USAGE_BASED_LICENSING = SubnetConfiguration(
    name='UsageBasedLicensing',
    subnet_type=SubnetType.PRIVATE_WITH_NAT,
    # 14 IP addresses
    cidr_mask=28
)

# Subnets for the Worker instances
WORKERS = SubnetConfiguration(
    name='Workers',
    subnet_type=SubnetType.PRIVATE_WITH_NAT,
    # 4,094 IP addresses
    cidr_mask=20
)
