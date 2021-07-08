# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from typing import (
    List,
    Mapping,
    Optional,
)

class AppConfig:
    """
    Configuration values for the sample app.

    TODO: Fill these in with your own values.
    """
    def __init__(self):
        # A map of regions to Deadline Client Linux AMIs. As an example, the base Linux Deadline 10.1.19.4 AMI ID
        # from us-west-2 is filled in. It can be used as-is, added to, or replaced. Ideally the version here
        #  should match the one used for staging the render queue and usage based licensing recipes.
        self.deadline_client_linux_ami_map: Mapping[str, str] = {'us-west-2': 'ami-04ae356533dc07fb5'}

        # Whether the DeadlineResourceTracker stack and supporting resources already exist in the account/region you are deploying to.
        #
        # If this is false, resources required by the Deadline Resource Tracker will be deployed into your account.
        # If this is true, these resources will be skipped.
        self.deadline_resource_tracker_exists: bool = False


config: AppConfig = AppConfig()
