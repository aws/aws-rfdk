# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass, field
from enum import Enum
import os
from typing import List

from aws_cdk.aws_ec2 import (
    IMachineImage,
    OperatingSystemType
)
from aws_cdk.aws_iam import (
    CfnInstanceProfile,
    ManagedPolicy,
    PolicyStatement,
    Role,
    ServicePrincipal
)
from aws_cdk.aws_imagebuilder import (
    CfnComponent,
    CfnDistributionConfiguration,
    CfnImage,
    CfnImageRecipe,
    CfnInfrastructureConfiguration
)
from aws_cdk.core import (
    Construct,
    Token
)

from . import template

@dataclass
class ImageBuilderProps():
    # The version of Deadline to install
    deadline_version: str

    # The parent image of the image recipe. Can use static methods on MachineImage to find your AMI. See
    # https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.MachineImage.html for more details.
    parent_ami: IMachineImage

    # The image version must be bumped any time the image or any components are modified, otherwise
    # CloudFormation will fail to update.
    # Must be in the format x.x.x
    image_version: str

    # Customer-defined Image Builder components
    components: List[CfnComponent] = field(default_factory=list)

    # The Image Builder distribution configuration.
    # See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-distribution-settings.html for more info.
    distributionConfiguration: CfnDistributionConfiguration = None

    # The Image Builder infrastructure configuration.
    # See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-infra-config.html for more info.
    infrastructureConfiguration: CfnInfrastructureConfiguration = None

class DeadlineMachineImage(Construct):
    """
    Construct to setup all the required Image Builder constructs to create an AMI with Deadline installed.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        props: ImageBuilderProps,
    ):
        super().__init__(scope, construct_id)

        parent_ami = props.parent_ami.get_image(self)

        # Create the Deadline component that defines how to install Deadline onto an image
        deadline_component_data = self.get_deadline_component(
            props.deadline_version,
            parent_ami.os_type
        )
        deadline_component = CfnComponent(
            self,
            f"DeadlineComponent{construct_id}",
            platform=self.get_os_type_string(parent_ami.os_type),
            version=props.image_version,
            data=deadline_component_data,
            description='Installs Deadline client',
            name=f"DeadlineComponent{construct_id}"
        )

        # Create a list of the Deadline component and any other user defined components we want
        component_arn_list = [{ "componentArn": deadline_component.attr_arn }]
        for component in props.components:
            component_arn_list.append({ "componentArn": component.attr_arn })

        # Create our image recipe that defines how to create our AMI, using our components list
        image_recipe = CfnImageRecipe(
            self,
            f"DeadlineRecipe{construct_id}",
            components=component_arn_list,
            name=f"DeadlineInstallationRecipe{construct_id}",
            parent_image=parent_ami.image_id,
            version=props.image_version
        )
        image_recipe.add_depends_on(deadline_component)
        for component in props.components:
            image_recipe.add_depends_on(component)

        infrastructure_configuration = self.create_default_infrastructure_config(construct_id)

        # Create an image using the recipe
        deadline_image = CfnImage(
            self,
            f"DeadlineMachineImage{construct_id}",
            image_recipe_arn=image_recipe.attr_arn,
            infrastructure_configuration_arn=infrastructure_configuration.attr_arn
        )

        self.ami_id = Token.as_string(deadline_image.get_att("ImageId"))
        self.node.default_child = deadline_image

    def get_deadline_component(
        self,
        deadline_version: str,
        os_type: OperatingSystemType,
    ) -> str:
        """
        Create the YAML document that has the instructions to install Deadline.
        """
        if os_type is OperatingSystemType.LINUX:
            s3_uri = f"s3://thinkbox-installers/Deadline/{deadline_version}/Linux/DeadlineClient-{deadline_version}-linux-x64-installer.run"
        else:
            s3_uri = f"s3://thinkbox-installers/Deadline/{deadline_version}/Windows/DeadlineClient-{deadline_version}-windows-installer.exe"

        return template.template_component(
            props=template.TemplateProps(
                template_path=os.path.join(
                    os.getcwd(),
                    "..",
                    "components",
                    f"deadline-{self.get_os_type_string(os_type).lower()}.component.template"
                ),
                tokens={
                    "s3uri": s3_uri,
                    "version": deadline_version
                }
            )
        )

    def create_default_infrastructure_config(self, construct_id: str) -> CfnInfrastructureConfiguration:
        """
        Create the default infrastructure config, which defines the permissions needed by Image Builder during
        image creation.
        """
        image_builder_role_name = f"DeadlineMachineImageBuilderRole{construct_id}"
        image_builder_role = Role(
            self,
            image_builder_role_name,
            assumed_by=ServicePrincipal("ec2.amazonaws.com"),
            role_name= image_builder_role_name
        )
        image_builder_role.add_managed_policy(ManagedPolicy.from_aws_managed_policy_name('EC2InstanceProfileForImageBuilder'))
        image_builder_role.add_managed_policy(ManagedPolicy.from_aws_managed_policy_name('AmazonSSMManagedInstanceCore'))

        image_builder_role.add_to_policy(PolicyStatement(
            actions=[
                's3:Get*',
                's3:List*',
            ],
            resources=['arn:aws:s3:::thinkbox-installers/*']
        ))

        image_builder_profile_name = f"DeadlineMachineImageBuilderPolicy{construct_id}"
        image_builder_profile = CfnInstanceProfile(
            self,
            image_builder_profile_name,
            instance_profile_name=image_builder_profile_name,
            roles=[ image_builder_role_name ]
        )
        image_builder_profile.add_depends_on(image_builder_role.node.default_child)

        infrastructure_configuration = CfnInfrastructureConfiguration(
            self,
            f"InfrastructureConfig{construct_id}",
            name=f"DeadlineInfrastructureConfig{construct_id}",
            instance_profile_name=image_builder_profile_name
        )
        infrastructure_configuration.add_depends_on(image_builder_profile)

        return infrastructure_configuration

    def get_os_type_string(self, os_type: OperatingSystemType) -> str:
        if (os_type is OperatingSystemType.LINUX):
            return 'Linux'
        elif (os_type is OperatingSystemType.WINDOWS):
            return 'Windows'

        return 'Unknown'