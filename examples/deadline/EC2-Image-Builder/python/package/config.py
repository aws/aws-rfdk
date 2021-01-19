# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from aws_rfdk.deadline import AwsThinkboxEulaAcceptance

class AppConfig:
    """
    Configuration values for the sample app.

    TODO: Fill these in with your own values.
    """
    def __init__(self):
        # Change this value to AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA if you wish to accept the EULA for
        # Deadline and proceed with Deadline deployment. Users must explicitly accept the AWS Thinkbox EULA before using the
        # AWS Thinkbox Deadline container images.
        #
        # See https://www.awsthinkbox.com/end-user-license-agreement for the terms of the agreement.
        self.accept_aws_thinkbox_eula: AwsThinkboxEulaAcceptance = AwsThinkboxEulaAcceptance.USER_ACCEPTS_AWS_THINKBOX_EULA

        # The version of Deadline to install on the AMI. This needs to be exact, during synthesis the app will write this
        # value into the Image Builder component document that will get uploaded to Image Builder. The VersionQuery cannot
        # be used here because its version gets calculated in a Lambda during deployment and is not available at synthesis.
        self.deadline_version: str = '10.1.13.1'

        # This version is used for the version of the Deadline component and the image recipe in the DeadlineImage construct.
        # It must be bumped manually whenever changes are made to the recipe.
        self.image_recipe_version: str = '1.0.0'

        # The AMI ID of the parent AMI to install Deadline onto. Be sure to provide an AMI that is in the region you
        # are deploying your app into. The example provided is for "Amazon Linux 2 AMI (HVM), SSD Volume Type (64-bit x86)"
        # in us-west-2.
        self.deadline_parent_ami_id_linux: str = 'ami-0a36eb8fadc976275'

        # The AMI ID of the parent AMI to install Deadline onto. Be sure to provide an AMI that is in the region you
        # are deploying your app into. The example provided is for "Microsoft Windows Server 2019 Base with Containers"
        # in us-west-2.
        self.deadline_parent_ami_id_windows: str = 'ami-07f9aa0ff79eca6c4'

config: AppConfig = AppConfig()
