#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

from aws_cdk.core import (
    App,
    Environment
)
from aws_cdk.aws_ec2 import (
    InstanceClass,
    InstanceSize,
    InstanceType,
    MachineImage
)

from .lib import (
    network_tier,
    security_tier,
    storage_tier,
    service_tier,
    compute_tier
)

from .config import config


def main():
    # ------------------------------
    # Validate Config Values
    # ------------------------------

    if not config.ubl_certificate_secret_arn and config.ubl_licenses:
        raise ValueError('UBL certificates secret ARN is required when using UBL but was not specified.')

    if not config.ubl_licenses:
        print('No UBL licenses specified. UBL Licensing will not be set up.')

    if not config.key_pair_name:
        print('EC2 key pair name not specified. You will not have SSH access to the render farm.')

    if 'region' in config.deadline_client_linux_ami_map:
        raise ValueError('Deadline Client Linux AMI map is required but was not specified.')

    if not config.enable_secrets_management and config.secrets_management_secret_arn:
        print('Deadline Secrets Management is disabled, so the admin credentials specified in the provided secret will not be used.')

    # ------------------------------
    # Application
    # ------------------------------
    app = App()

    if 'CDK_DEPLOY_ACCOUNT' not in os.environ and 'CDK_DEFAULT_ACCOUNT' not in os.environ:
        raise ValueError('You must define either CDK_DEPLOY_ACCOUNT or CDK_DEFAULT_ACCOUNT in the environment.')
    if 'CDK_DEPLOY_REGION' not in os.environ and 'CDK_DEFAULT_REGION' not in os.environ:
        raise ValueError('You must define either CDK_DEPLOY_REGION or CDK_DEFAULT_REGION in the environment.')
    env = Environment(
        account=os.environ.get('CDK_DEPLOY_ACCOUNT', os.environ.get('CDK_DEFAULT_ACCOUNT')),
        region=os.environ.get('CDK_DEPLOY_REGION', os.environ.get('CDK_DEFAULT_REGION'))
    )

    # ------------------------------
    # Network Tier
    # ------------------------------
    network = network_tier.NetworkTier(
        app,
        'NetworkTier',
        env=env
    )

    # ------------------------------
    # Security Tier
    # ------------------------------
    security = security_tier.SecurityTier(
        app,
        'SecurityTier',
        env=env
    )

    # ------------------------------
    # Storage Tier
    # ------------------------------
    if config.deploy_mongo_db:
        storage_props = storage_tier.StorageTierMongoDBProps(
            vpc=network.vpc,
            database_instance_type=InstanceType.of(InstanceClass.MEMORY5, InstanceSize.LARGE),
            alarm_email=config.alarm_email_address,
            root_ca=security.root_ca,
            dns_zone=network.dns_zone,
            accept_sspl_license=config.accept_sspl_license,
            key_pair_name=config.key_pair_name
        )
        storage = storage_tier.StorageTierMongoDB(app, 'StorageTier', props=storage_props, env=env)
    else:
        storage_props = storage_tier.StorageTierDocDBProps(
            vpc=network.vpc,
            database_instance_type=InstanceType.of(InstanceClass.MEMORY5, InstanceSize.LARGE),
            alarm_email=config.alarm_email_address
        )
        storage = storage_tier.StorageTierDocDB(app, 'StorageTier', props=storage_props, env=env)

    # ------------------------------
    # Service Tier
    # ------------------------------
    service_props = service_tier.ServiceTierProps(
        database=storage.database,
        mountable_file_system=storage.mountable_file_system,
        vpc=network.vpc,
        ubl_certs_secret_arn=config.ubl_certificate_secret_arn,
        ubl_licenses=config.ubl_licenses,
        root_ca=security.root_ca,
        dns_zone=network.dns_zone,
        deadline_version=config.deadline_version,
        accept_aws_thinkbox_eula=config.accept_aws_thinkbox_eula,
        enable_secrets_management=config.enable_secrets_management,
        secrets_management_secret_arn=config.secrets_management_secret_arn
    )
    service = service_tier.ServiceTier(app, 'ServiceTier', props=service_props, env=env)

    # ------------------------------
    # Compute Tier
    # ------------------------------
    deadline_client_image = MachineImage.generic_linux(config.deadline_client_linux_ami_map)
    compute_props = compute_tier.ComputeTierProps(
        vpc=network.vpc,
        render_queue=service.render_queue,
        worker_machine_image=deadline_client_image,
        key_pair_name=config.key_pair_name,
        usage_based_licensing=service.ubl_licensing,
        licenses=config.ubl_licenses
    )
    _compute = compute_tier.ComputeTier(app, 'ComputeTier', props=compute_props, env=env)

    app.synth()


if __name__ == '__main__':
    main()
