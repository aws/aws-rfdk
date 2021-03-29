# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from typing import (
    List,
    Mapping,
    Optional
)

from aws_rfdk import MongoDbSsplLicenseAcceptance
from aws_rfdk.deadline import (
    AwsThinkboxEulaAcceptance,
    UsageBasedLicense
)


class AppConfig:
    """
    Configuration values for the sample app.

    TODO: Fill these in with your own values.
    """
    def __init__(self):
        # Change this value to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA if you wish to accept the EULA
        # for Deadline and proceed with Deadline deployment. Users must explicitly accept the AWS Thinkbox EULA before
        # using the AWS Thinkbox Deadline container images.
        #
        # See https://www.awsthinkbox.com/end-user-license-agreement for the terms of the agreement.
        self.accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_REJECTS_AWS_THINKBOX_EULA

        # Fill this in if you want to recieve alarm emails when:
        # 1) You are crossing thresholds on decreasing burst Credits on the Amazon EFS that is
        #  set up in the StorageTier, for the Deadline Repository.
        #
        # Note: When deploying, you will be sent an email asking to authorize these emails. If you do not authorize,
        # then you will receive no alarm emails.
        self.alarm_email_address: Optional[str] = None

        # The version of Deadline to use on the render farm. Leave as None for the latest release or specify a version
        # to pin to. Some examples of pinned version values are "10", "10.1", or "10.1.12"
        self.deadline_version: Optional[str] = None

        # A map of regions to Deadline Client Linux AMIs. As an example, the Linux Deadline 10.1.13.2 AMI ID
        # from us-west-2 is filled in. It can be used as-is, added to, or replaced. Ideally the version here should match the version of
        # Deadline used in any connected Deadline constructs.
        self.deadline_client_linux_ami_map: Mapping[str, str] = {'us-west-2': 'ami-0237f13ce87af168e'}

        # A secret (in binary form) in SecretsManager that stores the UBL certificates in a .zip file.
        self.ubl_certificate_secret_arn: str =\
            ''

        # The UBL licenses to use.
        self.ubl_licenses: List[UsageBasedLicense] = []

        # (Optional) The name of the EC2 keypair to associate with the instances.
        self.key_pair_name: Optional[str] = None

        # Whether to use MongoDB to back the render farm.
        # If false, then we use Amazon DocumentDB to back the render farm.
        self.deploy_mongo_db: bool = False

        # This is only relevant if deploy_mongo_db is True.
        #
        # Change this value to MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL
        # if you wish to accept the SSPL and proceed with MongoDB deployment.
        self.accept_sspl_license: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL


config: AppConfig = AppConfig()
