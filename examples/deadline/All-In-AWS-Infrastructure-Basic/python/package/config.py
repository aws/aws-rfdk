# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from typing import (
    List,
    Mapping,
    Optional
)

from aws_rfdk import MongoDbSsplLicenseAcceptance
from aws_rfdk.deadline import (
    AwsCustomerAgreementAndIpLicenseAcceptance,
    UsageBasedLicense
)


class AppConfig:
    """
    Configuration values for the sample app.

    TODO: Fill these in with your own values.
    """
    def __init__(self):
        # By downloading or using the Deadline software, you agree to the AWS Customer Agreement (https://aws.amazon.com/agreement/)
        # and AWS Intellectual Property License (https://aws.amazon.com/legal/aws-ip-license-terms/). You acknowledge that Deadline
        # is AWS Content as defined in those Agreements.
        # To accept these terms, change the value here to AwsCustomerAgreementAndIpLicenseAcceptance.USER_ACCEPTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE
        self.accept_aws_customer_agreement_and_ip_license: AwsCustomerAgreementAndIpLicenseAcceptance = AwsCustomerAgreementAndIpLicenseAcceptance.USER_REJECTS_AWS_CUSTOMER_AGREEMENT_AND_IP_LICENSE

        # Fill this in if you want to receive alarm emails when:
        # 1) You are crossing thresholds on decreasing burst Credits on the Amazon EFS that is
        #  set up in the StorageTier, for the Deadline Repository.
        #
        # Note: When deploying, you will be sent an email asking to authorize these emails. If you do not authorize,
        # then you will receive no alarm emails.
        self.alarm_email_address: Optional[str] = None

        # The version of Deadline to use on the render farm. Leave as None for the latest release or specify a version
        # to pin to. Some examples of pinned version values are "10", "10.1", or "10.1.12"
        self.deadline_version: Optional[str] = None

        # A map of regions to Deadline Client Linux AMIs. As an example, the base Linux Deadline 10.1.19.4 AMI ID
        # from us-west-2 is filled in. It can be used as-is, added to, or replaced. Ideally the version here should match the version of
        # Deadline used in any connected Deadline constructs.
        self.deadline_client_linux_ami_map: Mapping[str, str] = {'us-west-2': 'ami-04ae356533dc07fb5'}

        # A secret (in binary form) in SecretsManager that stores the UBL certificates in a .zip file.
        # This must be in the format `arn:<partition>:secretsmanager:<region>:<accountId>:secret:<secretName>-<6RandomCharacters`
        self.ubl_certificate_secret_arn: str =\
            ''

        # The UBL licenses to use.
        self.ubl_licenses: List[UsageBasedLicense] = []

        # (Optional) The name of the EC2 keypair to associate with the instances.
        self.key_pair_name: Optional[str] = None

        # Whether to use MongoDB to back the render farm.
        # If false, then we use Amazon DocumentDB to back the render farm.
        self.deploy_mongo_db: bool = False

        # Whether to enable Deadline Secrets Management.
        self.enable_secrets_management: bool = True

        # A Secret in AWS SecretsManager that stores the admin credentials for Deadline Secrets Management.
        # If not defined and Secrets Management is enabled, an AWS Secret with admin credentials will be generated.
        self.secrets_management_secret_arn: Optional[str] = None

        # This is only relevant if deploy_mongo_db is True.
        #
        # Change this value to MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL
        # if you wish to accept the SSPL and proceed with MongoDB deployment.
        self.accept_sspl_license: MongoDbSsplLicenseAcceptance = MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL


config: AppConfig = AppConfig()
