# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import typing
from dataclasses import dataclass

from aws_cdk import (
    Duration,
    Stack,
    StackProps
)
from aws_cdk.aws_ec2 import (
    BastionHostLinux,
    BlockDevice,
    BlockDeviceVolume,
    IVpc,
    SubnetSelection
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
    MountableEfs,
    SessionManagerHelper,
    X509CertificatePem
)
from aws_rfdk.deadline import (
    AwsThinkboxEulaAcceptance,
    DatabaseConnection,
    RenderQueue,
    RenderQueueHostNameProps,
    RenderQueueTrafficEncryptionProps,
    RenderQueueExternalTLSProps,
    Repository,
    SecretsManagementProps,
    ThinkboxDockerImages,
    UsageBasedLicense,
    UsageBasedLicensing,
    VersionQuery,
)
from constructs import (
    Construct
)


from . import subnets


@dataclass
class ServiceTierProps(StackProps):
    """
    Properties for ServiceTier
    """
    # The VPC to deploy service tier resources into.
    vpc: IVpc
    # The database to connect to.
    database: DatabaseConnection
    # The file-system to install Deadline Repository to.
    mountable_file_system: MountableEfs
    # The ARN of the secret containing the UBL certificates .zip file (in binary form).
    ubl_certs_secret_arn: typing.Optional[str]
    # The UBL licenses to configure
    ubl_licenses: typing.List[UsageBasedLicense]
    # Our self-signed root CA certificate for the internal endpoints in the farm.
    root_ca: X509CertificatePem
    # Internal DNS zone for the VPC
    dns_zone: IPrivateHostedZone
    # Version of Deadline to use
    deadline_version: str
    # Whether the AWS Thinkbox End-User License Agreement is accepted or not
    accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance
    # Whether to enable Deadline Secrets Management.
    enable_secrets_management: bool
    # The ARN of the AWS Secret containing the admin credentials for Deadline Secrets Management.
    secrets_management_secret_arn: typing.Optional[str]


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

        # Bastion instance for convenience (e.g. SSH into RenderQueue and WorkerFleet instances).
        # Not a critical component of the farm, so this can be safely removed. An alternative way
        # to access your hosts is also provided by the Session Manager, which is also configured
        # later in this example.
        self.bastion = BastionHostLinux(
            self,
            'Bastion',
            vpc=props.vpc,
            subnet_selection=SubnetSelection(
                subnet_group_name=subnets.PUBLIC.name
            ),
            block_devices=[
                BlockDevice(
                    device_name='/dev/xvda',
                    volume=BlockDeviceVolume.ebs(50, encrypted=True)
                )
            ]
        )

        # Mounting the root of the EFS file-system to the bastion access for convenience.
        # This can safely be removed.
        MountableEfs(self, filesystem=props.mountable_file_system.file_system).mount_to_linux_instance(
            self.bastion.instance,
            location='/mnt/efs'
        )

        self.version = VersionQuery(
            self,
            'Version',
            version=props.deadline_version
        )

        secrets_management_settings = SecretsManagementProps(
            enabled = props.enable_secrets_management
        )
        if props.enable_secrets_management and props.secrets_management_secret_arn is not None:
            secrets_management_settings["credentials"] = Secret.from_secret_arn(self, 'SMAdminUser', props.secrets_management_secret_arn)

        repository = Repository(
            self,
            'Repository',
            vpc=props.vpc,
            vpc_subnets=SubnetSelection(
                subnet_group_name=subnets.INFRASTRUCTURE.name
            ),
            database=props.database,
            file_system=props.mountable_file_system,
            repository_installation_timeout=Duration.minutes(20),
            repository_installation_prefix='/',
            version=self.version,
            secrets_management_settings=secrets_management_settings
        )

        images = ThinkboxDockerImages(
            self,
            'Images',
            version=self.version,
            user_aws_thinkbox_eula_acceptance=props.accept_aws_thinkbox_eula
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
            vpc_subnets=SubnetSelection(
                subnet_group_name=subnets.INFRASTRUCTURE.name
            ),
            # It is considered good practice to put the Render Queue's load blanacer in dedicated subnets because:
            #
            # 1. Deadline Secrets Management identity registration settings will be scoped down to least-privilege
            #
            #    (see https://github.com/aws/aws-rfdk/blob/release/packages/aws-rfdk/lib/deadline/README.md#render-queue-subnet-placement)
            #
            # 2. The load balancer can scale to use IP addresses in the subnet without conflicts from other AWS
            #    resources
            #
            #    (see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#subnets-load-balancer)
            vpc_subnets_alb=SubnetSelection(
                subnet_group_name=subnets.RENDER_QUEUE_ALB.name
            ),
            images=images,
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
            version=self.version,
            # TODO - Evaluate deletion protection for your own needs. This is set to false to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that this resource is not accidentally deleted, you should set this to true.
            deletion_protection=False,
            # Enable a local transparent filesystem cache of the Repository filesystem to reduce
            # data traffic from the Repository's filesystem.
            # For an EFS and NFS filesystem, this requires the 'fsc' mount option.
            enable_local_file_caching=True,
        )
        self.render_queue.connections.allow_default_port_from(self.bastion)

        # This is an optional feature that will set up your EC2 instances to be enabled for use with
        # the Session Manager. RFDK deploys EC2 instances that aren't available through a public subnet,
        # so connecting to them by SSH isn't easy. This is an option to quickly access hosts without
        # using a bastion instance.
        # It's important to note that the permissions need to be granted to the render queue's ASG,
        # rather than the render queue itself.
        SessionManagerHelper.grant_permissions_to(self.render_queue.asg)

        if props.ubl_licenses:
            if not props.ubl_certs_secret_arn:
                raise ValueError('UBL certificates secret ARN is required when using UBL but was not specified.')
            ubl_cert_secret = Secret.from_secret_complete_arn(self, 'ublcertssecret', props.ubl_certs_secret_arn)
            self.ubl_licensing = UsageBasedLicensing(
                self,
                'UsageBasedLicensing',
                vpc=props.vpc,
                vpc_subnets=SubnetSelection(
                    subnet_group_name=subnets.USAGE_BASED_LICENSING.name
                ),
                images=images,
                licenses=props.ubl_licenses,
                render_queue=self.render_queue,
                certificate_secret=ubl_cert_secret,
            )

            # Another optional usage of the SessionManagerHelper that demonstrates how to configure the UBL
            # construct's ASG for access. Note that this construct also requires you to apply the permissions
            # to its ASG property.
            SessionManagerHelper.grant_permissions_to(self.ubl_licensing.asg)
        else:
            self.ubl_licensing = None
