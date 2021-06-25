# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass

from aws_cdk.core import (
    Construct,
    RemovalPolicy,
    Stack,
    StackProps
)
from aws_cdk.aws_ec2 import (
    Vpc,
)
from aws_rfdk.deadline import (
    AwsThinkboxEulaAcceptance,
    RenderQueue,
    RenderQueueExternalTLSProps,
    RenderQueueTrafficEncryptionProps,
    Repository,
    RepositoryRemovalPolicies,
    ThinkboxDockerImages,
    VersionQuery,
)


@dataclass
class BaseFarmStackProps(StackProps):
    # Whether the AWS Thinkbox End-User License Agreement is accepted or not
    accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance

    # Version of Deadline to use
    deadline_version: str


class BaseFarmStack(Stack):
    """
    This stack includes all the basic setup required for a render farm. It excludes the worker fleet.
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: BaseFarmStackProps, **kwargs):
        """
        Initialize a new instance of BaseFarmStack
        """
        super().__init__(scope, stack_id, **kwargs)

         # The VPC that all components of the render farm will be created in.
        self.vpc = Vpc(
            self,
            'Vpc',
            max_azs=2,
        )

        version = VersionQuery(
            self,
            'Version',
            version=props.deadline_version,
        )

        images = ThinkboxDockerImages(
            self,
            'Images',
            version=version,
            user_aws_thinkbox_eula_acceptance=props.accept_aws_thinkbox_eula,
        )

        repository = Repository(
            self,
            'Repository',
            removal_policy=RepositoryRemovalPolicies(
                database=RemovalPolicy.DESTROY,
                filesystem=RemovalPolicy.DESTROY,
            ),
            vpc=self.vpc,
            version=version,
        )

        self.render_queue = RenderQueue(
            self,
            'RenderQueue',
            vpc=self.vpc,
            version=version,
            images=images,
            repository=repository,
            deletion_protection=False,
            traffic_encryption=RenderQueueTrafficEncryptionProps( external_tls=RenderQueueExternalTLSProps( enabled=False ) ),
        )
