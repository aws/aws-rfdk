# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from typing import (
    Optional
)
from dataclasses import dataclass

from aws_cdk.core import (
    Construct,
    Duration,
    Stack,
    StackProps,
    Tags
)
from aws_cdk.aws_ec2 import (
    IMachineImage,
    InstanceClass,
    InstanceSize,
    InstanceType,
    SecurityGroup,
    Vpc
)
from aws_cdk.aws_iam import (
    ManagedPolicy,
    Role,
    ServicePrincipal
)
from aws_cdk.aws_elasticloadbalancingv2 import (
    ApplicationProtocol
)
from aws_cdk.aws_route53 import (
    PrivateHostedZone
)
from aws_rfdk.deadline import (
    ConfigureSpotEventPlugin,
    RenderQueue,
    RenderQueueExternalTLSProps,
    RenderQueueHostNameProps,
    RenderQueueTrafficEncryptionProps,
    Repository,
    SpotEventPluginFleet,
    SpotEventPluginSettings,
    Stage,
    ThinkboxDockerRecipes
)
from aws_rfdk import (
    DistinguishedName,
    X509CertificatePem
)


@dataclass
class SEPStackProps(StackProps):
    """
    Properties for ServiceTier
    """
    # The path to the directory where the staged Deadline Docker recipes are.
    docker_recipes_stage_path: str
    # The IMachineImage to use for Workers (needs Deadline Client installed).
    worker_machine_image: IMachineImage
    # The name of the EC2 keypair to associate with Worker nodes.
    key_pair_name: Optional[str]


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

        # The following code is used to demonstrate how to use the ConfigureSpotEventPlugin if TLS is enabled.
        host = 'renderqueue'
        zone_name = 'deadline-test.internal'

        # Internal DNS zone for the VPC.
        dns_zone = PrivateHostedZone(
            self,
            'DnsZone',
            vpc=vpc,
            zone_name=zone_name
        )

        # NOTE: This certificate is also used by ConfigureSpotEventPlugin construct below.
        ca_cert = X509CertificatePem(
            self,
            'RootCA',
            subject=DistinguishedName(
                cn='SampleRootCA'
            )
        )

        server_cert = X509CertificatePem(
            self,
            'RQCert',
            subject=DistinguishedName(
                cn=f'{host}.{dns_zone.zone_name}',
                o='RFDK-Sample',
                ou='RenderQueueExternal'
            ),
            signing_certificate=ca_cert
        )

        render_queue = RenderQueue(
            self,
            'RenderQueue',
            vpc=vpc,
            version=recipes.version,
            images=recipes.render_queue_images,
            repository=repository,
            # TODO - Evaluate deletion protection for your own needs. This is set to false to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that this resource is not accidentally deleted, you should set this to true.
            deletion_protection=False,
            hostname=RenderQueueHostNameProps(
                hostname=host,
                zone=dns_zone
            ),
            traffic_encryption=RenderQueueTrafficEncryptionProps(
                external_tls=RenderQueueExternalTLSProps(
                    rfdk_certificate=server_cert
                ),
                internal_protocol=ApplicationProtocol.HTTPS
            )
        )

        # Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
        # Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
        Role(
            self,
            'ResourceTrackerRole',
            assumed_by=ServicePrincipal('lambda.amazonaws.com'),
            managed_policies= [ManagedPolicy.from_aws_managed_policy_name('AWSThinkboxDeadlineResourceTrackerAccessPolicy')],
            role_name= 'DeadlineResourceTrackerAccessRole'
        )

        fleet = SpotEventPluginFleet(
            self,
            'SpotEventPluginFleet',
            vpc=vpc,
            render_queue=render_queue,
            deadline_groups=['group_name'],
            instance_types=[InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.LARGE)],
            worker_machine_image=props.worker_machine_image,
            target_capacity=1,
            key_name=props.key_pair_name
        )

        # Optional: Add additional tags to both spot fleet request and spot instances.
        Tags.of(fleet).add('name', 'SEPtest')

        ConfigureSpotEventPlugin(
            self,
            'ConfigureSpotEventPlugin',
            vpc=vpc,
            render_queue=render_queue,
            version=recipes.version,
            ca_cert=ca_cert.cert,
            spot_fleets=[fleet],
            configuration=SpotEventPluginSettings(
                enable_resource_tracker=True,
                region=self.region
            )
        )

