# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass

from aws_cdk.core import (
    Construct,
    Stack,
    StackProps,
)
from aws_cdk.aws_ec2 import (
    MachineImage,
    Vpc,
)
from aws_rfdk.deadline import (
    RenderQueue,
    WorkerInstanceFleet,
)

from .deadline_image import (
    DeadlineImage,
    ImageBuilderProps,
    OSType,
)

@dataclass
class ComputeStackProps(StackProps):
    # The version of Deadline to run on the workers
    deadline_version: str

    # The version of the image recipe used to create the AMI's for the workers
    image_recipe_version: str

    # The AMI ID of the AMI that we'll use as the parent to install Deadline onto
    parent_ami_id_linux: str

    # The AMI ID of the AMI that we'll use as the parent to install Deadline onto
    parent_ami_id_windows: str

    # The render farm's RenderQueue costruct
    render_queue: RenderQueue

    # The VPC to connect the workers to
    vpc: Vpc


class ComputeStack(Stack):
    """
    The ComputeStack includes the worker fleets for the render farm as well as the creation of the images
    that those worker fleets will use.
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: ComputeStackProps, **kwargs):
        super().__init__(scope, stack_id, **kwargs)

        region = Stack.of(self).region

        # Take a Linux image and install Deadline on it to create a new image
        linux_image = DeadlineImage(
            self,
            "LinuxImage",
            props=ImageBuilderProps(
                deadline_version=props.deadline_version,
                os_type=OSType.LINUX,
                parent_ami=props.parent_ami_id_linux,
                image_version=props.image_recipe_version,
            ),
        )
        # Set up a worker fleet that uses the image we just created
        worker_fleet_linux = WorkerInstanceFleet(
            self,
            "WorkerFleetLinux",
            vpc=props.vpc,
            render_queue=props.render_queue,
            worker_machine_image=MachineImage.generic_linux({ region: linux_image.ami_id }),
        )
        worker_fleet_linux.fleet.node.default_child.node.add_dependency(linux_image.node.default_child)

        # Take a Windows image and install Deadline on it to create a new image
        windows_image = DeadlineImage(
            self,
            "WindowsImage",
            props=ImageBuilderProps(
                deadline_version=props.deadline_version,
                os_type=OSType.WINDOWS,
                parent_ami=props.parent_ami_id_windows,
                image_version=props.image_recipe_version,
            )
        )
        # Set up a worker fleet that uses the image we just created
        worker_fleet_windows = WorkerInstanceFleet(
            self,
            "WorkerFleetWindows",
            vpc=props.vpc,
            render_queue=props.render_queue,
            worker_machine_image=MachineImage.generic_windows({ region: windows_image.ami_id }),
        )
        worker_fleet_windows.fleet.node.default_child.node.add_dependency(windows_image.node.default_child)
