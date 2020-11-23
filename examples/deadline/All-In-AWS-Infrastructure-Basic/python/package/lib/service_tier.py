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
    BastionHostLinux,
    BlockDevice,
    BlockDeviceVolume,
    IVpc,
    SubnetSelection,
    SubnetType
)
from aws_cdk.aws_elasticloadbalancingv2 import (
    ApplicationProtocol
)
from aws_cdk.aws_secretsmanager import (
    Secret
)
from aws_cdk.aws_route53 import (
    IPrivateHostedZone
)

from aws_rfdk import (
    DistinguishedName,
    IMountableLinuxFilesystem,
    X509CertificatePem
)
from aws_rfdk.deadline import (
    DatabaseConnection,
    RenderQueue,
    RenderQueueHostNameProps,
    RenderQueueTrafficEncryptionProps,
    RenderQueueExternalTLSProps,
    Repository,
    Stage,
    ThinkboxDockerRecipes,
    UsageBasedLicense,
    UsageBasedLicensing,
)


@dataclass
class ServiceTierProps(StackProps):
    """
    Properties for ServiceTier
    """
    # The VPC to deploy service tier resources into.
    vpc: IVpc
    # The database to connect to.
    database: DatabaseConnection
    # The file system to install Deadline Repository to.
    file_system: IMountableLinuxFilesystem
    # The path to the directory where the staged Deadline Docker recipes are.
    docker_recipes_stage_path: str
    # The ARN of the secret containing the UBL certificates .zip file (in binary form).
    ubl_certs_secret_arn: typing.Optional[str]
    # The UBL licenses to configure
    ubl_licenses: typing.List[UsageBasedLicense]
    # Our self-signed root CA certificate for the internal endpoints in the farm.
    root_ca: X509CertificatePem
    # Internal DNS zone for the VPC
    dns_zone: IPrivateHostedZone


class ServiceTier(Stack):
    """
    The service tier contains all "business-logic" constructs
    (e.g. Render Queue, UBL Licensing/License Forwarder, etc.).
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: ServiceTierProps, **kwargs):
        """
        Initialize a new instance of ServiceTier
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties for this construct.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, **kwargs)

        # A bastion host to connect to the render farm with.
        # The bastion host is for convenience (e.g. SSH into RenderQueue and WorkerFleet instances).
        # This is not a critical component of the farm, so can safely be removed.
        self.bastion = BastionHostLinux(
            self,
            'Bastion',
            vpc=props.vpc,
            subnet_selection=SubnetSelection(
                subnet_type=SubnetType.PUBLIC
            ),
            block_devices=[
                BlockDevice(
                    device_name='/dev/xvda',
                    volume=BlockDeviceVolume.ebs(50, encrypted=True)
                )
            ]
        )

        # Granting the bastion access to the file system mount for convenience.
        # This can also safely be removed.
        props.file_system.mount_to_linux_instance(
            self.bastion.instance,
            location='/mnt/efs'
        )

        recipes = ThinkboxDockerRecipes(
            self,
            'Image',
            stage=Stage.from_directory(props.docker_recipes_stage_path)
        )

        repository = Repository(
            self,
            'Repository',
            vpc=props.vpc,
            database=props.database,
            file_system=props.file_system,
            repository_installation_timeout=Duration.minutes(20),
            version=recipes.version,
        )

        server_cert = X509CertificatePem(
            self,
            'RQCert',
            subject=DistinguishedName(
                cn=f'renderqueue.{props.dns_zone.zone_name}',
                o='RFDK-Sample',
                ou='RenderQueueExternal'
            ),
            signing_certificate=props.root_ca
        )

        self.render_queue = RenderQueue(
            self,
            'RenderQueue',
            vpc=props.vpc,
            images=recipes.render_queue_images,
            repository=repository,
            hostname=RenderQueueHostNameProps(
                hostname='renderqueue',
                zone=props.dns_zone
            ),
            traffic_encryption=RenderQueueTrafficEncryptionProps(
                external_tls=RenderQueueExternalTLSProps(
                    rfdk_certificate=server_cert
                ),
                internal_protocol=ApplicationProtocol.HTTPS
            ),
            version=recipes.version,
            # TODO - Evaluate deletion protection for your own needs. This is set to false to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that this resource is not accidentally deleted, you should set this to true.
            deletion_protection=False
        )
        self.render_queue.connections.allow_default_port_from(self.bastion)

        if props.ubl_licenses:
            if not props.ubl_certs_secret_arn:
                raise ValueError('UBL certificates secret ARN is required when using UBL but was not specified.')
            ubl_cert_secret = Secret.from_secret_arn(self, 'ublcertssecret', props.ubl_certs_secret_arn)
            self.ubl_licensing = UsageBasedLicensing(
                self,
                'usagebasedlicensing',
                vpc=props.vpc,
                images=recipes.ubl_images,
                licenses=props.ubl_licenses,
                render_queue=self.render_queue,
                certificate_secret=ubl_cert_secret,
            )
        else:
            self.ubl_licensing = None
