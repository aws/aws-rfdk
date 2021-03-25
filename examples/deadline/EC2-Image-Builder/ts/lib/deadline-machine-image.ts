/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  IMachineImage,
  OperatingSystemType,
} from '@aws-cdk/aws-ec2';
import {
  CfnInstanceProfile,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  CfnComponent,
  CfnDistributionConfiguration,
  CfnImage,
  CfnImageRecipe,
  CfnInfrastructureConfiguration,
} from '@aws-cdk/aws-imagebuilder';
import {
  CfnResource,
  Construct,
  Token,
} from '@aws-cdk/core';

import { templateComponent } from './template';

export interface DeadlineMachineImageProps {
  /**
   * The version of Deadline to install on the image
   */
  readonly deadlineVersion: string,

  /**
   * The parent image of the image recipe. Can use static methods on MachineImage to find your AMI. See
   * https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.MachineImage.html for more details.
   */
  readonly parentAmi: IMachineImage,

  /**
   * The image version must be bumped any time the image or any components are modified, otherwise
   * CloudFormation will fail to update.
   * Must be in the format x.x.x
   */
  readonly imageVersion: string,

  /**
   * Customer-defined Image Builder components
   *
   * @default - No extra components
   */
  readonly components?: CfnComponent[],

  /**
   * The Image Builder distribution configuration.
   * See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-distribution-settings.html for more info.
   *
   * @default - None
   */
  readonly distributionConfiguration?: CfnDistributionConfiguration,

  /**
   * The Image Builder infrastructure configuration.
   * See https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-infra-config.html for more info.
   *
   * @default - Creates a role with the minimum required permissions to create an AMI using the Deadline component.
   */
  readonly infrastructureConfiguration?: CfnInfrastructureConfiguration,
}

/**
 * Construct to setup all the required Image Builder constructs to create an AMI with Deadline installed.
 */
export class DeadlineMachineImage extends Construct {
  public readonly amiId: string;

  constructor(scope: Construct, id: string, props: DeadlineMachineImageProps) {
    super(scope, id);

    const infrastructureConfiguration = props.infrastructureConfiguration ?? this.createDefaultInfrastructureConfig(id);
    const parentAmi = props.parentAmi.getImage(this);

    // Create the Deadline component that will install Deadline onto any base image
    const deadlineComponentData = this.getDeadlineComponent(
      props.deadlineVersion,
      parentAmi.osType,
    );

    const deadlineComponent = new CfnComponent(scope, `DeadlineComponent${id}`, {
      platform: this.getOsTypeString(parentAmi.osType),
      version: props.imageVersion,
      data: deadlineComponentData,
      description: 'Installs Deadline client',
      name: `Deadline${id}`,
    });

    // Create a list of the Deadline component and any other user defined components we want
    const componentArnList = [{ componentArn: deadlineComponent.attrArn }];
    props.components?.forEach(component => {
      componentArnList.push({ componentArn: component.attrArn });
    });

    // Create our image recipe that defines how to create our AMI, using our components list
    const imageRecipe = new CfnImageRecipe(scope, `DeadlineRecipe${id}`, {
      components: componentArnList,
      name: `DeadlineInstallationRecipe${id}`,
      parentImage: parentAmi.imageId,
      version: props.imageVersion,
    });
    imageRecipe.addDependsOn(deadlineComponent);
    props.components?.forEach(component => {
      imageRecipe.addDependsOn(component);
    })

    // Create an AMI using the recipe
    const deadlineMachineImage = new CfnImage(scope, `DeadlineMachineImage${id}`, {
      imageRecipeArn: imageRecipe.attrArn,
      infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
    });

    this.node.defaultChild = deadlineMachineImage;
    this.amiId = Token.asString(deadlineMachineImage.getAtt('ImageId'));
  }

  /**
   * Create the default infrastructure config, which defines the permissions needed by Image Builder during image creation.
   */
  private createDefaultInfrastructureConfig(id: string): CfnInfrastructureConfiguration {
    const imageBuilderRoleName = `DeadlineMachineImageBuilderRole${id}`;

    const imageBuilderRole = new Role(this, imageBuilderRoleName, {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      roleName: imageBuilderRoleName,
    });
    imageBuilderRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'));
    imageBuilderRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    imageBuilderRole.addToPolicy(new PolicyStatement({
      actions: [
        's3:Get*',
        's3:List*',
      ],
      resources: ['arn:aws:s3:::thinkbox-installers/*'],
    }));

    const imageBuilderProfileName = `DeadlineMachineImageBuilderPolicy${id}`;
    const imageBuilderProfile = new CfnInstanceProfile(this, imageBuilderProfileName, {
      instanceProfileName: imageBuilderProfileName,
      roles: [ imageBuilderRoleName ],
    });

    imageBuilderProfile.addDependsOn(imageBuilderRole.node.defaultChild as CfnResource);

    const infrastructureConfiguration = new CfnInfrastructureConfiguration(
        this,
        `InfrastructureConfig${id}`,
        {
          name: `DeadlineInfrastructureConfig${id}`,
          instanceProfileName: imageBuilderProfileName,
        });

    infrastructureConfiguration.addDependsOn(imageBuilderProfile);

    return infrastructureConfiguration;
  }

  /**
   * Get the EC2 Image Builder Component for installing Deadline
   */
  private getDeadlineComponent(
    deadlineVersion: string,
    osType: OperatingSystemType,
  ): string {
    const s3Uri = osType == OperatingSystemType.LINUX
      ? `s3://thinkbox-installers/Deadline/${deadlineVersion}/Linux/DeadlineClient-${deadlineVersion}-linux-x64-installer.run`
      : `s3://thinkbox-installers/Deadline/${deadlineVersion}/Windows/DeadlineClient-${deadlineVersion}-windows-installer.exe`;

    return templateComponent({
      templatePath: path.join(__dirname, '..', '..', 'components', `deadline-${this.getOsTypeString(osType).toLowerCase()}.component.template`),
      tokens: {
        s3uri: s3Uri,
        version: deadlineVersion,
      },
    });
  }

  /**
   * Translate the OperatingSystemType enum into a string.
   */
  private getOsTypeString(osType: OperatingSystemType): string {
    if (osType === OperatingSystemType.LINUX) {
      return 'Linux';
    }
    else if (osType === OperatingSystemType.WINDOWS) {
      return 'Windows';
    }
    return 'Unknown';
  }
}
