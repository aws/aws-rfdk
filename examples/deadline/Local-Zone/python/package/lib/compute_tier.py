# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass
from typing import (
    List,
    Optional
)

from aws_cdk.core import (
    Construct,
    Stack,
    StackProps
)
from aws_cdk.aws_ec2 import (
    BastionHostLinux,
    IMachineImage,
    InstanceClass,
    InstanceSize,
    InstanceType,
    IVpc,
    SubnetSelection,
    SubnetType
)

from aws_rfdk import (
    HealthMonitor
)
from aws_rfdk.deadline import (
    IRenderQueue,
    WorkerInstanceFleet
)


@dataclass
class ComputeTierProps(StackProps):
    """
    Properties for ComputeTier
    """
    # The VPC to deploy resources into.
    vpc: IVpc
    # The availability zones the worker instances will be deployed to. This can include your local
    # zones, but they must belong to the same region as the standard zones used in other stacks in
    # this application.
    availability_zones: List[str]
    # The IRenderQueue that Deadline Workers connect to.
    render_queue: IRenderQueue
    # The IMachineImage to use for Workers (needs Deadline Client installed).
    worker_machine_image: IMachineImage
    # The name of the EC2 keypair to associate with Worker nodes.
    key_pair_name: Optional[str]
    # The bastion host to  allow connection to Worker nodes.
    bastion: Optional[BastionHostLinux] = None


class ComputeTier(Stack):
    """
    The computer tier consists of the worker fleets. We'll be deploying the workers into the
    local zone we're using.
    """
    def __init__(self, scope: Construct, stack_id: str, *, props: ComputeTierProps, **kwargs):
        """
        Initializes a new instance of ComputeTier
        :param scope: The Scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties of this construct.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, **kwargs)

        # We can put the health monitor and worker fleet in all of the local zones we're using
        subnets = SubnetSelection(
            availability_zones=props.availability_zones,
            subnet_type=SubnetType.PRIVATE,
            # one_per_az=True,
        )

        # We can put the health monitor in all of the local zones we're using for the worker fleet
        self.health_monitor = HealthMonitor(
            self,
            'HealthMonitor',
            vpc=props.vpc,
            vpc_subnets=subnets,
            deletion_protection=False
        )

        self.worker_fleet = WorkerInstanceFleet(
            self,
            'WorkerFleet',
            vpc=props.vpc,
            vpc_subnets=subnets,
            render_queue=props.render_queue,
            # Not all instance types will be available in local zones. For a list of the instance types
            # available in each local zone, you can refer to:
            # https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/#AWS_Services
            instance_type=InstanceType.of(InstanceClass.STANDARD5, InstanceSize.LARGE),
            worker_machine_image=props.worker_machine_image,
            health_monitor=self.health_monitor,
            key_name=props.key_pair_name
        )
