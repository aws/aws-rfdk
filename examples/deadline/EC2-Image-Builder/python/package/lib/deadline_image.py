# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass, field
from enum import Enum
import os
from typing import List

from aws_cdk.aws_iam import (
    CfnInstanceProfile,
    PolicyStatement,
    Role,
    ServicePrincipal,
)
from aws_cdk.aws_imagebuilder import (
    CfnComponent,
    CfnDistributionConfiguration,
    CfnImage,
    CfnImageRecipe,
    CfnInfrastructureConfiguration,
)
from aws_cdk.aws_s3_assets import (
    Asset,
)
from aws_cdk.core import (
    Construct,
    Token,
)

from . import template

class OSType(Enum):
    # The Windows operating system
    WINDOWS = 'Windows'
    # The Linux operating system
    LINUX = 'Linux'

@dataclass
class ImageBuilderProps():
    # The version of Deadline to install
    deadline_version: str

    # The operating system of the image
    os_type: OSType

    # The parent image of the image recipe.
    # The string must be either an Image ARN (SemVers is ok) or an AMI ID.
    # For example, to get the latest vesion of your image, use "x.x.x" like:
    # arn:aws:imagebuilder:us-west-2:123456789123:image/my-image/x.x.x
    parent_ami: str

    # The image version must be bumped any time the image or any components are modified, otherwise
    # CloudFormation will fail to update.
    # Must be in the format x.x.x
    image_version: str

    # Customer defined Image Builder components
    components: List[CfnComponent] = field(default_factory=list)

    # The Image Builder distribution configuration.
    # See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-distribution-settings.html for more info.
    distributionConfiguration: CfnDistributionConfiguration = None

    # The Image Builder infrastructure configuration.
    # See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-infra-config.html for more info.
    infrastructureConfiguration: CfnInfrastructureConfiguration = None

class DeadlineImage(Construct):
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

        # Create the Deadline component that defines how to install Deadline onto an image
        deadline_component_doc = self.get_deadline_component_doc(
            props.deadline_version,
            construct_id,
            props.os_type,
            scope,
        )
        deadline_component = CfnComponent(
            scope,
            f"DeadlineComponent{construct_id}",
            platform=props.os_type.value,
            version=props.image_version,
            uri=deadline_component_doc.s3_object_url,
            description='Installs Deadline',
            name=f"DeadlineComponent{construct_id}",
        )

        # Create the image recipe that includes all the information required to create an image
        component_arn_list = [{ "componentArn": deadline_component.attr_arn }]
        for component in props.components:
            component_arn_list.append({ "componentArn": component.attr_arn })

        image_recipe = CfnImageRecipe(
            scope,
            f"DeadlineRecipe{construct_id}",
            components=component_arn_list,
            name=f"DeadlineInstallationRecipe{construct_id}",
            parent_image=props.parent_ami,
            version=props.image_version,
        )
        image_recipe.add_depends_on(deadline_component)
        for component in props.components:
            image_recipe.add_depends_on(component)

        infrastructure_configuration = self.create_default_infrastructure_config(scope, construct_id)

        # Create an image using the recipe
        deadline_image = CfnImage(
            scope,
            f"DeadlineImage{construct_id}",
            image_recipe_arn=image_recipe.attr_arn,
            infrastructure_configuration_arn=infrastructure_configuration.attr_arn,
            tags={
                "DeadlineVersion": props.deadline_version,
                "ParentAmi": props.parent_ami,
            },
        )

        self.ami_id = Token.as_string(deadline_image.get_att("ImageId"))
        self.node.default_child = deadline_image

    def get_deadline_component_doc(
        self,
        deadline_version: str,
        construct_id: str,
        os_type: OSType,
        scope: Construct,
    ) -> Asset:
        """
        Create the YAML document that has the instructions to install Deadline.
        """
        if os_type is OSType.LINUX:
            s3_uri = f"s3://thinkbox-installers/Deadline/{deadline_version}/Linux/DeadlineClient-{deadline_version}-linux-x64-installer.run"
        else:
            s3_uri = f"s3://thinkbox-installers/Deadline/{deadline_version}/Windows/DeadlineClient-{deadline_version}-windows-installer.exe"

        return Asset(
            scope,
            f"DeadlineComponentDoc{construct_id}",
            path= template.template_component(
                props=template.TemplateProps(
                    template_path=os.path.join(
                        os.getcwd(),
                        "..",
                        "components",
                        f"deadline-{os_type.value.lower()}.component.template",
                    ),
                    tokens={
                        "s3uri": s3_uri,
                        "version": deadline_version,
                    }
                )
            )
        )

    def create_default_infrastructure_config(self, scope: Construct, construct_id: str) -> CfnInfrastructureConfiguration:
        """
        Create the default infrastructure config, which defines the permissions needed by Image Builder during
        image creation.
        """
        image_builder_role_name = f"DeadlineImageBuilderRole{construct_id}"
        image_builder_role = Role(
            scope,
            f"DeadlineImageBuilderRole{construct_id}",
            assumed_by=ServicePrincipal("ec2.amazonaws.com"),
            role_name= image_builder_role_name,
        )
        image_builder_role.add_to_policy(PolicyStatement(
            actions=[
                'ec2messages:AcknowledgeMessage',
                'ec2messages:DeleteMessage',
                'ec2messages:FailMessage',
                'ec2messages:GetEndpoint',
                'ec2messages:GetMessages',
                'ec2messages:SendReply',
                'imagebuilder:GetComponent',
                's3:Get*',
                's3:List*',
                'ssm:DescribeAssociation',
                'ssm:GetDeployablePatchSnapshotForInstance',
                'ssm:GetDocument',
                'ssm:DescribeDocument',
                'ssm:GetManifest',
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:ListAssociations',
                'ssm:ListInstanceAssociations',
                'ssm:PutInventory',
                'ssm:PutComplianceItems',
                'ssm:PutConfigurePackageResult',
                'ssm:UpdateAssociationStatus',
                'ssm:UpdateInstanceAssociationStatus',
                'ssm:UpdateInstanceInformation',
                'ssmmessages:CreateControlChannel',
                'ssmmessages:CreateDataChannel',
                'ssmmessages:OpenControlChannel',
                'ssmmessages:OpenDataChannel',
            ],
            resources=['*'],
        ))
        image_builder_role.add_to_policy(PolicyStatement(
            actions=['logs:*'],
            resources=['arn:aws:logs:*:*:log-group:/aws/imagebuilder/*'],
        ))
        image_builder_role.add_to_policy(PolicyStatement(
            actions=[ 'kms:Decrypt' ],
            resources=['*'],
            conditions={
                "StringEquals": {
                    'kms:EncryptionContextKeys': 'aws:imagebuilder:arn',
                    'aws:CalledVia': 'imagebuilder.amazonaws.com'
                },
            }
        ))

        image_builder_profile_name = f"DeadlineImageBuilderPolicy{construct_id}"
        image_builder_profile = CfnInstanceProfile(
            scope,
            f"DeadlineImageBuilderPolicy{construct_id}",
            instance_profile_name=image_builder_profile_name,
            roles=[ image_builder_role_name ],
        )
        image_builder_profile.add_depends_on(image_builder_role.node.default_child)

        infrastructure_configuration = CfnInfrastructureConfiguration(
            scope,
            f"InfrastructureConfig{construct_id}",
            name=f"DeadlineInfrastructureConfig{construct_id}",
            instance_profile_name=image_builder_profile_name,
        )
        infrastructure_configuration.add_depends_on(image_builder_profile)

        return infrastructure_configuration
