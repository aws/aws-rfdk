# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from aws_rfdk.deadline import AwsCustomerAgreementAndIpLicenseAcceptance

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

        # The version of Deadline to install on the AMI. This can be either a partial version that will use the latest patch, such as
        # '10.1' or '10.1.13', or a full version that will be pinned to a specific patch release, such as '10.1.13.1'.
        self.deadline_version: str = '10.1'

        # This version is used for the version of the Deadline component and the image recipe in the DeadlineMachineImage construct.
        # It must be bumped manually whenever changes are made to the recipe.
        self.image_recipe_version: str = '1.0.0'

config: AppConfig = AppConfig()
