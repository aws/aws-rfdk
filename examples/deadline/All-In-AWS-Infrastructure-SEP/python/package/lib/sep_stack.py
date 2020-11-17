# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import typing
from dataclasses import dataclass

from aws_cdk.core import (
    Construct,
    Duration,
    Stack,
    StackProps
)
from aws_cdk.aws_ec2 import (
    SecurityGroup,
    Vpc,
)
from aws_cdk.aws_iam import (
    ManagedPolicy,
    Role,
    ServicePrincipal 
)
from aws_rfdk.deadline import (
    RenderQueue,
    Repository,
    Stage,
    ThinkboxDockerRecipes,
)


@dataclass
class SEPStackProps(StackProps):
    """
    Properties for ServiceTier
    """
    # The path to the directory where the staged Deadline Docker recipes are.
    docker_recipes_stage_path: str


class SEPStack(Stack):
    """
    The service tier contains all "business-logic" constructs
    (e.g. Render Queue, UBL Licensing/License Forwarder, etc.).
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: SEPStackProps, **kwargs):
        """
        Initialize a new instance of ServiceTier
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties for this construct.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, **kwargs)

         # The VPC that all components of the render farm will be created in.
        vpc = Vpc(
            self,
            'Vpc',
            max_azs=2
        )

        recipes = ThinkboxDockerRecipes(
            self,
            'Image',
            stage=Stage.from_directory(props.docker_recipes_stage_path)
        )

        repository = Repository(
            self,
            'Repository',
            vpc=vpc,
            version=recipes.version,
            repository_installation_timeout=Duration.minutes(20)
        )

        render_queue = RenderQueue(
            self,
            'RenderQueue',
            vpc=props.vpc,
            version=recipes.version,
            images=recipes.render_queue_images,
            repository=repository,
            # TODO - Evaluate deletion protection for your own needs. This is set to false to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that this resource is not accidentally deleted, you should set this to true.
            deletion_protection=False
        )
        # Adds the following IAM managed Policies to the Render Queue so it has the necessary permissions
        # to run the Spot Event Plugin and launch a Resource Tracker:
        # * AWSThinkboxDeadlineSpotEventPluginAdminPolicy
        # * AWSThinkboxDeadlineResourceTrackerAdminPolicy
        render_queue.add_sep_policies()

        # Create the security group that you will assign to your workers
        worker_security_group = SecurityGroup(
            self,
            'SpotSecurityGroup', 
            vpc=props.vpc,
            allow_all_outbound=True,
            security_group_name='DeadlineSpotSecurityGroup',
        )
        worker_security_group.connections.allow_to_default_port(
            render_queue.endpoint
        )
        
        # Create the IAM Role for the Spot Event Plugins workers.
        # Note: This Role MUST have a roleName that begins with "DeadlineSpot"
        # Note: If you already have a worker IAM role in your account you can remove this code.
        worker_iam_role = Role(
            self,
            'SpotWorkerRole',
            assumed_by=ServicePrincipal('ec2.amazonaws.com'),
            managed_policies= [ManagedPolicy.from_aws_managed_policy_name('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy')],
            role_name= 'DeadlineSpotWorkerRole',
        )

        # Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
        # Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
        Role(
            self,
            'ResourceTrackerRole',
            assumed_by=ServicePrincipal('lambda.amazonaws.com'),
            managed_policies= [ManagedPolicy.from_aws_managed_policy_name('AWSThinkboxDeadlineResourceTrackerAccessPolicy')],
            role_name= 'DeadlineResourceTrackerAccessRole',
        )

