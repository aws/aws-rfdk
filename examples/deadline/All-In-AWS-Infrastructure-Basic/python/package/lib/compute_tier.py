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
    IVpc,
    Port
)
from aws_cdk.aws_s3_assets import (
  Asset
)

from aws_rfdk import (
    HealthMonitor,
    SessionManagerHelper,
)
from aws_rfdk.deadline import (
    InstanceUserDataProvider,
    IRenderQueue,
    UsageBasedLicense,
    UsageBasedLicensing,
    WorkerInstanceFleet,
)

import os

@dataclass
class ComputeTierProps(StackProps):
    """
    Properties for ComputeTier
    """
    # The VPC to deploy resources into.
    vpc: IVpc
    # The IRenderQueue that Deadline Workers connect to.
    render_queue: IRenderQueue
    # The IMachineImage to use for Workers (needs Deadline Client installed).
    worker_machine_image: IMachineImage
    # The name of the EC2 keypair to associate with Worker nodes.
    key_pair_name: Optional[str]
    # The bastion host to  allow connection to Worker nodes.
    bastion: Optional[BastionHostLinux] = None
    # Licensing source for UBL for worker nodes.
    usage_based_licensing: Optional[UsageBasedLicensing] = None
    # List of the usage-based liceses that the worker nodes will be served.
    licenses: Optional[List[UsageBasedLicense]] = None

class UserDataProvider(InstanceUserDataProvider):
    def __init__(self, scope: Construct, stack_id: str):
        super().__init__(scope, stack_id)
        self.test_script=Asset(scope, "SampleAsset",
            path=os.path.join(os.getcwd(), "..", "scripts", "configure_worker.sh")
        )

    def pre_cloud_watch_agent(self, host) -> None:
        host.user_data.add_commands("echo preCloudWatchAgent")

    def pre_render_queue_configuration(self, host) -> None:
        host.user_data.add_commands("echo preRenderQueueConfiguration")

    def pre_worker_configuration(self, host) -> None:
        host.user_data.add_commands("echo preWorkerConfiguration")

    def post_worker_launch(self, host) -> None:
        host.user_data.add_commands("echo postWorkerLaunch")
        self.test_script.grant_read(host)
        local_path = host.user_data.add_s3_download_command(
            bucket=self.test_script.bucket,
            bucket_key=self.test_script.s3_object_key
        )
        host.user_data.add_execute_file_command(file_path=local_path)

class ComputeTier(Stack):
    """
    The compute tier consists of raw compute power.
    For a Deadline render farm, this will be the fleet of
    Worker nodes that render Deadline jobs.
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

        self.health_monitor = HealthMonitor(
            self,
            'HealthMonitor',
            vpc=props.vpc,
            # TODO - Evaluate deletion protection for your own needs. This is set to false to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that this resource is not accidentally deleted, you should set this to true.
            deletion_protection=False
        )

        self.worker_fleet = WorkerInstanceFleet(
            self,
            'WorkerFleet',
            vpc=props.vpc,
            render_queue=props.render_queue,
            worker_machine_image=props.worker_machine_image,
            health_monitor=self.health_monitor,
            key_name=props.key_pair_name,
            user_data_provider=UserDataProvider(self, 'UserDataProvider')
        )

        # This is an optional feature that will set up your EC2 instances to be enabled for use with
        # the Session Manager. These worker fleet instances aren't available through a public subnet,
        # so connecting to them directly through SSH isn't easy.
        SessionManagerHelper.grant_permissions_to(self.worker_fleet)

        if props.usage_based_licensing and props.licenses:
            props.usage_based_licensing.grant_port_access(self.worker_fleet, props.licenses)

        if props.bastion:
            self.worker_fleet.connections.allow_from(props.bastion, Port.tcp(22))
