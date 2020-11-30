#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

from aws_cdk.core import (
    App,
    Environment
)

from .lib import (
    sep_stack,
)

def main():
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
    # Service Tier
    # ------------------------------
    sep_props = sep_stack.SEPStackProps(
        docker_recipes_stage_path=os.path.join(os.path.dirname(os.path.realpath(__file__)), os.pardir, 'stage'),
    )
    service = sep_stack.SEPStack(app, 'SEPStack', props=sep_props, env=env)

    app.synth()


if __name__ == '__main__':
    main()
