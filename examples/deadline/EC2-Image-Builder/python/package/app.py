#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

from aws_cdk import (
    App,
    Environment
)

from .config import config
from .lib import (
    base_farm_stack,
    compute_stack
)

def main():
    app = App()

    if 'CDK_DEPLOY_ACCOUNT' not in os.environ and 'CDK_DEFAULT_ACCOUNT' not in os.environ:
        raise ValueError('You must define either CDK_DEPLOY_ACCOUNT or CDK_DEFAULT_ACCOUNT in the environment.')
    if 'CDK_DEPLOY_REGION' not in os.environ and 'CDK_DEFAULT_REGION' not in os.environ:
        raise ValueError('You must define either CDK_DEPLOY_REGION or CDK_DEFAULT_REGION in the environment.')
    env = Environment(
        account=os.environ.get('CDK_DEPLOY_ACCOUNT', os.environ.get('CDK_DEFAULT_ACCOUNT')),
        region=os.environ.get('CDK_DEPLOY_REGION', os.environ.get('CDK_DEFAULT_REGION'))
    )

    farm_props = base_farm_stack.BaseFarmStackProps(
        deadline_version=config.deadline_version,
        accept_aws_thinkbox_eula=config.accept_aws_thinkbox_eula
    )
    farm_stack = base_farm_stack.BaseFarmStack(app, 'BaseFarmStack', props=farm_props, env=env)

    compute_stack_props = compute_stack.ComputeStackProps(
        deadline_version=config.deadline_version,
        image_recipe_version=config.image_recipe_version,
        render_queue=farm_stack.render_queue,
        vpc=farm_stack.vpc
    )
    compute_stack.ComputeStack(app, 'ComputeStack', props=compute_stack_props, env=env)

    app.synth()


if __name__ == '__main__':
    main()
