# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
from dataclasses import dataclass
from typing import Optional

from aws_cdk import (
    Duration,
    RemovalPolicy,
    Size,
    Stack,
    StackProps
)
from aws_cdk.aws_cloudwatch import (
    ComparisonOperator,
    Metric,
    TreatMissingData
)
from aws_cdk.aws_cloudwatch_actions import (
    SnsAction
)
from aws_cdk.aws_docdb import (
    BackupProps,
    DatabaseCluster,
    Login
)
from aws_cdk.aws_ec2 import (
    InstanceType,
    IVpc,
    SubnetSelection
)
from aws_cdk.aws_efs import (
    AccessPoint,
    Acl,
    FileSystem,
    PosixUser
)
from aws_cdk.aws_iam import (
    ServicePrincipal
)
from aws_cdk.aws_kms import (
    Key
)
from aws_cdk.aws_route53 import (
    IPrivateHostedZone
)
from aws_cdk.aws_sns import (
    Topic
)
from aws_cdk.aws_sns_subscriptions import (
    EmailSubscription
)
from aws_rfdk import (
    MongoDbUsers,
    MongoDbX509User,
    DistinguishedName,
    MongoDbInstance,
    MongoDbApplicationProps,
    MongoDbPostInstallSetup,
    MongoDbSsplLicenseAcceptance,
    MongoDbVersion,
    MountableEfs,
    PadEfsStorage,
    X509CertificatePem,
    X509CertificatePkcs12
)
from aws_rfdk.deadline import (
    DatabaseConnection
)
from constructs import (
    Construct
)

from . import subnets


@dataclass
class StorageTierProps(StackProps):
    """
    Properties for StorageTier
    """
    # The VPC to deploy resources into.
    vpc: IVpc

    # Email address to send alerts to when CloudWatch Alarms breach. If not specified, no alarms or alerts will be
    # deployed.
    alarm_email: Optional[str]


class StorageTier(Stack):
    """
    The storage tier of the render farm.
    This stack contains all constructs that persist data which would be useful to keep between deployments.
    There should little to no "business-logic" constructs in this stack.
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: StorageTierProps, **kwargs):
        """
        Initializes a new instance of StorageTier
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties for the storage tier.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, **kwargs)

        # The file-system to use (e.g. to install Deadline Repository onto).
        file_system = FileSystem(
            self,
            'EfsFileSystem',
            vpc=props.vpc,
            vpc_subnets=SubnetSelection(
                subnet_group_name=subnets.INFRASTRUCTURE.name
            ),
            encrypted=True,
            # TODO - Evaluate this removal policy for your own needs. This is set to DESTROY to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that your data is not accidentally deleted, you should modify this value.
            removal_policy=RemovalPolicy.DESTROY
        )

        # Create an EFS access point that is used to grant the Repository and RenderQueue with write access to the
        # Deadline Repository directory in the EFS file-system.
        access_point = AccessPoint(
            self,
            'AccessPoint',
            file_system=file_system,

            # The AccessPoint will create the directory (denoted by the path property below) if it doesn't exist with
            # the owning UID/GID set as specified here. These should be set up to grant read and write access to the
            # UID/GID configured in the "poxis_user" property below.
            create_acl=Acl(
                owner_uid='10000',
                owner_gid='10000',
                permissions='750',
            ),

            # When you mount the EFS via the access point, the mount will be rooted at this path in the EFS file-system
            path='/DeadlineRepository',

            # TODO - When you mount the EFS via the access point, all file-system operations will be performed using
            # these UID/GID values instead of those from the user on the system where the EFS is mounted. If you intend
            # to use the same EFS file-system for other purposes (e.g. render assets, plug-in storage), you may want to
            # evaluate the UID/GID permissions based on your requirements.
            posix_user=PosixUser(
                uid='10000',
                gid='10000'
            )
        )

        self.mountable_file_system = MountableEfs(
            self,
            filesystem=file_system,
            access_point=access_point,
            # We have enable_local_file_caching set to True on the RenderQueue in the
            # Service Tier. EFS requires the 'fsc' mount option to take advantage of
            # that.
            extra_mount_options=['fsc']
        )

        # The database to connect Deadline to.
        self.database: Optional[DatabaseConnection] = None

        # The Amazon EFS filesystem deployed above has been deployed in bursting throughput
        # mode. This means that it can burst throughput up to 100 MiB/s (with reads counting as
        # 1/3 of their actual throughput for this purpose). However, the baseline throughput of the EFS
        # is 50 KiB/s per 1 GiB stored in the filesystem and exceeding this throughput consumes burst credits.
        # An EFS starts with a large amount of burst credits, and regains credits when throughput is below
        # the baseline throughput threshold.
        #
        # The Deadline Repository is approximately 1 GiB in size; resulting in 50 KiB/s baseline throughput, which is
        # not sufficient for the operation of Deadline.
        #
        # The following:
        # 1) Sets up a series of AWS CloudWatch Alarms that will send you an email to alert you to take action
        # to increase the data stored in the filesystem when the burst credits have decreased below certain thresholds.
        # If you run out of burst credits on the filesystem, then Deadline will start timing-out on requests and your
        # render farm may become unstable.
        # 2) Uses RFDK's PadEfsStorage construct to add data to the EFS for the purpose of increasing the amount
        # of stored data to increase the baseline throughput.
        #
        # See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
        # for more information on AWS CloudWatch Alarms.
        # See: https://docs.aws.amazon.com/efs/latest/ug/performance.html#throughput-modes
        # for more information on Amazon EFS throughput modes.

        if props.alarm_email:
            self.add_low_efs_burst_credit_alarms(file_system, props.alarm_email)

        # Add padding files to the filesystem to increase baseline throughput. We add files to the filesystem to
        # increase this baseline throughput, while retaining the ability to burst throughput. See RFDK's PadEfsStorage
        # documentation for additional details.
        pad_access_point = AccessPoint(
            self,
            'PaddingAccessPoint',
            file_system=file_system,
            path='/RFDK_PaddingFiles',
            # TODO - We set the padding files to be owned by root (uid/gid = 0) by default. You may wish to change this.
            create_acl=Acl(
                owner_gid='0',
                owner_uid='0',
                permissions='700',
            ),
            posix_user=PosixUser(
                uid='0',
                gid='0',
            ),
        )
        PadEfsStorage(
            self,
            'PadEfsStorage',
            vpc=props.vpc,
            vpc_subnets=SubnetSelection(
                subnet_group_name=subnets.INFRASTRUCTURE.name
            ),
            access_point=pad_access_point,
            desired_padding=Size.gibibytes(40), # Provides 2 MiB/s of baseline throughput. Costs $12/month.
        )

    def add_low_efs_burst_credit_alarms(self, filesystem: FileSystem, email_address: str) -> None:
        '''
        Set up CloudWatch Alarms that will warn when the given filesystem's burst credits are below
        four different thresholds. We send an email to the given address when an Alarm breaches.
        '''
        # Set up the SNS Topic that will send the emails.
        # ====================
        # 1) KMS key to use to encrypt events within the SNS Topic. The Key is optional
        key = Key(
            self,
            'SNSEncryptionKey',
            description='Used to encrypt the SNS Topic for sending EFS Burst Credit alerts',
            enable_key_rotation=True,
            removal_policy=RemovalPolicy.DESTROY
        )
        key.grant(ServicePrincipal('cloudwatch.amazonaws.com'), 'kms:Decrypt', 'kms:GenerateDataKey')

        # 2) SNS Topic that will be alerted by CloudWatch and will send the email in response.
        sns_topic = Topic(
            self,
            'BurstAlertEmailTopic',
            master_key=key
        )
        sns_topic.grant_publish(ServicePrincipal('cloudwatch.amazonaws.com'))
        sns_topic.add_subscription(EmailSubscription(email_address))
        alarm_action = SnsAction(sns_topic)

        # Set up the CloudWatch Alarm(s) and have them trigger SNS events when breached.
        # ======================
        # 1) CDK helper to define the CloudWatch Metric that we're interested in.
        burst_credits_metric = Metric(
            metric_name='BurstCreditBalance',
            namespace='AWS/EFS',
            dimensions_map={
                "FileSystemId": filesystem.file_system_id
            },
            # One 99-th percentile data point sample every hour
            period=Duration.hours(1),
            statistic='p99'
        )

        # 2) Create the alarms
        thresholds = [
            {
                "id": 'CAUTION-EfsBurstCredits',
                "name": f"CAUTION Burst Credits - {filesystem.file_system_id}",
                "threshold": int(2.00 * 2**40),
                "message": f"CAUTION. 2 TiB Threshold Breached: EFS {filesystem.file_system_id} is depleting burst credits. Add data to the EFS to increase baseline throughput.",
                # Alarm after 6 datapoints below threshold. We have 1 datapoint every hour. So, we alarm if below threshold for 6hrs
                "datapoints": 6
            },
            {
                "id": 'WARNING-EfsBurstCredits',
                "name": f"WARNING Burst Credits - {filesystem.file_system_id}",
                "threshold": int(1.25 * 2**40),
                "message": f"WARNING. 1.25 TiB Threshold Breached: EFS {filesystem.file_system_id} is depleting burst credits. Add data to the EFS to increase baseline throughput.",
                # Alarm after 6 datapoints below threshold. We have 1 datapoint every hour. So, we alarm if below threshold for 6hrs
                "datapoints": 6
            },
            {
                "id": 'ALERT-EfsBurstCredits',
                "name": f"ALERT Burst Credits - {filesystem.file_system_id}",
                "threshold": int(0.50 * 2**40),
                "message": f"ALERT! 500 GiB Threshold Breached: EFS {filesystem.file_system_id} is running out of burst credits. Add data to the EFS to increase baseline throughput or else the Render Farm may cease operation.",
                # Alarm after 6 datapoints below threshold. We have 1 datapoint every hour. So, we alarm if below threshold for 6hrs
                "datapoints": 6
            },
            {
                "id": 'EMERGENCY-EfsBurstCredits',
                "name": f"EMERGENCY Burst Credits - {filesystem.file_system_id}",
                "threshold": int(0.10 * 2**40),
                "message": f"EMERGENCY! 100 GiB Threshold Breached: EFS {filesystem.file_system_id} is running out of burst credits. Add data to the EFS to increase baseline throughput or else the Render Farm will cease operation.",
                # Alarm after 2 datapoints below threshold. We have 1 datapoint every hour. So, we alarm if below threshold for 2hrs
                "datapoints": 2
            },
        ]
        for config in thresholds:
            alarm = burst_credits_metric.create_alarm(
                self,
                config['id'],
                alarm_name=config['name'],
                actions_enabled=True,
                alarm_description=config['message'],
                treat_missing_data=TreatMissingData.NOT_BREACHING,
                threshold=config['threshold'],
                comparison_operator=ComparisonOperator.LESS_THAN_THRESHOLD,
                evaluation_periods=config['datapoints']
            )
            alarm.add_alarm_action(alarm_action)


@dataclass
class StorageTierDocDBProps(StorageTierProps):
    """
    Properties for StorageTierDocDB.
    """
    # The InstanceType for DocDB.
    database_instance_type: InstanceType


class StorageTierDocDB(StorageTier):
    """
    An implementation of StorageTier that is backed by DocumentDB.
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: StorageTierDocDBProps, **kwargs):
        """
        Initializes a new instance of StorageTier
        :param scope: The scope of this construct.
        :param stack_id: the ID of this construct.
        :param props: The properties for the storage tier.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, props=props, **kwargs)

        doc_db = DatabaseCluster(
            self,
            'DocDBCluster',
            vpc=props.vpc,
            vpc_subnets=SubnetSelection(
                subnet_group_name=subnets.INFRASTRUCTURE.name
            ),
            instance_type=props.database_instance_type,
            # TODO - For cost considerations this example only uses 1 Database instance.
            # It is recommended that when creating your render farm you use at least 2 instances for redundancy.
            instances=1,
            master_user=Login(username='adminuser'),
            engine_version='3.6.0',
            backup=BackupProps(
                # We recommend setting the retention of your backups to 15 days
                # for security reasons. The default retention is just one day.
                # Please note that changing this value will affect cost.
                retention=Duration.days(15)
            ),
            # TODO - Evaluate this removal policy for your own needs. This is set to DESTROY to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that your data is not accidentally deleted, you should modify this value.
            removal_policy=RemovalPolicy.DESTROY
        )

        self.database = DatabaseConnection.for_doc_db(
            database=doc_db,
            login=doc_db.secret
        )


@dataclass
class StorageTierMongoDBProps(StorageTierProps):
    """
    Properties for StorageTierMongoDB
    """
    # The InstanceType for MongoDB.
    database_instance_type: InstanceType
    # Self-signed root CA to sign server certificate with.
    root_ca: X509CertificatePem
    # Internal DNS zone for the VPC.
    dns_zone: IPrivateHostedZone
    # Whether the SSPL license is accepted or not.
    accept_sspl_license: MongoDbSsplLicenseAcceptance
    # The name of the EC2 keypair to associate with the MongoDB instance.
    key_pair_name: Optional[str]


class StorageTierMongoDB(StorageTier):
    """
    An implementation of StorageTier that is backed by MongoDB.
    """

    def __init__(self, scope: Construct, stack_id: str, *, props: StorageTierMongoDBProps, **kwargs):
        """
        Initialize a new instance of StorageTierMongoDB
        :param scope: The scope of this construct.
        :param stack_id: The ID of this construct.
        :param props: The properties for this construct.
        :param kwargs: Any kwargs that need to be passed on to the parent class.
        """
        super().__init__(scope, stack_id, props=props, **kwargs)

        server_cert = X509CertificatePem(
            self,
            'MongoCert',
            subject=DistinguishedName(
                cn=f'mongo.{props.dns_zone.zone_name}',
                o='RFDK-Sample',
                ou='MongoServer'
            ),
            signing_certificate=props.root_ca
        )

        client_cert = X509CertificatePem(
            self,
            'DeadlineMongoCert',
            subject=DistinguishedName(
                cn='SampleUser',
                o='RFDK-Sample',
                ou='MongoClient'
            ),
            signing_certificate=props.root_ca
        )
        client_pkcs12 = X509CertificatePkcs12(
            self,
            'DeadlineMongoPkcs12',
            source_certificate=client_cert
        )

        availability_zone = props.vpc.availability_zones[0]

        mongo_vpc_subnet = SubnetSelection(
            subnet_group_name=subnets.INFRASTRUCTURE.name,
            availability_zones=[availability_zone]
        )

        mongo_db = MongoDbInstance(
            self,
            'MongoDb',
            vpc=props.vpc,
            vpc_subnets=mongo_vpc_subnet,
            key_name=props.key_pair_name,
            instance_type=props.database_instance_type,
            mongo_db=MongoDbApplicationProps(
                user_sspl_acceptance=props.accept_sspl_license,
                version=MongoDbVersion.COMMUNITY_3_6,
                hostname='mongo',
                dns_zone=props.dns_zone,
                server_certificate=server_cert
            )
        )

        _mongo_db_post_install_setup = MongoDbPostInstallSetup(
            self,
            'MongoDbPostInstall',
            vpc=props.vpc,
            vpc_subnets=mongo_vpc_subnet,
            mongo_db=mongo_db,
            users=MongoDbUsers(
                x509_auth_users=[
                    MongoDbX509User(
                        certificate=client_cert.cert,
                        roles=json.dumps([
                            {
                                'role': 'readWriteAnyDatabase',
                                'db': 'admin'
                            },
                            {
                                'role': 'clusterMonitor',
                                'db': 'admin'
                            }
                        ])
                    )
                ]
            )
        )

        self.database = DatabaseConnection.for_mongo_db_instance(
            database=mongo_db,
            client_certificate=client_pkcs12
        )
