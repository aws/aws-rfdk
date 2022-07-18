#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

from aws_cdk import (
    App,
    Environment
)
from aws_cdk.aws_ec2 import (
    MachineImage
)

from .lib import (
    config,
    network_tier,
    security_tier,
    service_tier,
    compute_tier
)


def main():
    # ------------------------------
    # Validate Config Values
    # ------------------------------
    if not config.config.key_pair_name:
        print('EC2 key pair name not specified. You will not have SSH access to the render farm.')

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
    # Service Tier
    # ------------------------------
    service_props = service_tier.ServiceTierProps(
        vpc=network.vpc,
        availability_zones=config.config.availability_zones_standard,
        root_ca=security.root_ca,
        dns_zone=network.dns_zone,
        deadline_version=config.config.deadline_version,
        accept_aws_thinkbox_eula=config.config.accept_aws_thinkbox_eula
    )
    service = service_tier.ServiceTier(app, 'ServiceTier', props=service_props, env=env)

    # ------------------------------
    # Compute Tier
    # ------------------------------
    deadline_client_image = MachineImage.generic_linux(config.config.deadline_client_linux_ami_map)
    compute_props = compute_tier.ComputeTierProps(
        vpc=network.vpc,
        availability_zones=config.config.availability_zones_local,
        render_queue=service.render_queue,
        worker_machine_image=deadline_client_image,
        key_pair_name=config.config.key_pair_name,
    )
    _compute = compute_tier.ComputeTier(app, 'ComputeTier', props=compute_props, env=env)

    app.synth()


if __name__ == '__main__':
    main()
