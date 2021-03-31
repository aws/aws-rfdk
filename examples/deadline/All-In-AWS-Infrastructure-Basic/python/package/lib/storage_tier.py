# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
from dataclasses import dataclass
from typing import Optional

from aws_cdk.core import (
    Construct,
    Duration,
    RemovalPolicy,
    Stack,
    StackProps
)
from aws_cdk.aws_docdb import (
    BackupProps,
    DatabaseCluster,
    InstanceProps,
    Login
)
from aws_cdk.aws_ec2 import (
    InstanceType,
    IVpc,
    SubnetSelection,
    SubnetType
)
from aws_cdk.aws_efs import (
    AccessPoint,
    Acl,
    FileSystem,
    PosixUser
)
from aws_cdk.aws_route53 import (
    IPrivateHostedZone
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


@dataclass
class StorageTierProps(StackProps):
    """
    Properties for StorageTier
    """
    # The VPC to deploy resources into.
    vpc: IVpc


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
            encrypted=True,
            # TODO - Evaluate this removal policy for your own needs. This is set to DESTROY to
            # cleanly remove everything when this stack is destroyed. If you would like to ensure
            # that your data is not accidentally deleted, you should modify this value.
            removal_policy=RemovalPolicy.DESTROY
        )

        # Add padding files to the filesystem to increase baseline throughput. Deadline's Repository filesystem
        # is small (initial size of about 1GB), which results in a very low baseline throughput for the Amazon
        # EFS filesystem. We add files to the filesystem to increase this baseline throughput, while retaining the
        # ability to burst throughput. See RFDK's PadEfsStorage documentation for additional details.
        pad_access_point = AccessPoint(
            self, 
            'PaddingAccessPoint',
            file_system=file_system,
            path='/PaddingFiles',
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
            access_point=pad_access_point,
            desired_padding_gb=40, # Provides 2 MB/s of baseline throughput. Costs $12/month.
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
            access_point=access_point
        )

        # The database to connect Deadline to.
        self.database: Optional[DatabaseConnection] = None


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
        instance_props = InstanceProps(
            vpc=props.vpc,
            vpc_subnets=SubnetSelection(subnet_type=SubnetType.PRIVATE),
            instance_type=props.database_instance_type
        )

        doc_db = DatabaseCluster(
            self,
            'DocDBCluster',
            instance_props=instance_props,
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
            subnet_type=SubnetType.PRIVATE,
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
