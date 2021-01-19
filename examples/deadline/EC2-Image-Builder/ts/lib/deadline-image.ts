/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  CfnInstanceProfile,
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
import { Asset } from '@aws-cdk/aws-s3-assets';
import {
  CfnResource,
  Construct,
  Token,
} from '@aws-cdk/core';

import { templateComponent } from './template';

export enum OSType {
  // The Windows operating system
  WINDOWS = 'Windows',

  // The Linux operating system
  LINUX = 'Linux',
}

export interface DeadlineImageProps {
  /**
   * The version of Deadline to install on the image
   */
  readonly deadlineVersion: string,

  /**
   * The operating system of the image.
   */
  readonly osType: OSType,

  /**
   * The parent image of the image recipe.
   * The string must be either an Image ARN (SemVers is ok) or an AMI ID.
   * For example, to get the latest vesion of your image, use "x.x.x" like:
   * arn:aws:imagebuilder:us-west-2:123456789123:image/my-image/x.x.x
   */
  readonly parentAmi: string,

  /**
   * The image version must be bumped any time the image or any components are modified, otherwise
   * CloudFormation will fail to update.
   * Must be in the format x.x.x
   */
  readonly imageVersion: string,

  /**
   * Customer defined Image Builder components
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
export class DeadlineImage extends Construct {
  public readonly amiId: string;

  constructor(scope: Construct, id: string, props: DeadlineImageProps) {
    super(scope, id);

    const infrastructureConfiguration = props.infrastructureConfiguration ?? this.createDefaultInfrastructureConfig(scope, id);

    // Create the Deadline component that will install Deadline onto any base image
    const deadlineComponentDoc = this.getDeadlineComponentDoc(
      props.deadlineVersion,
      id,
      props.osType,
      scope,
    );

    const deadlineComponent = new CfnComponent(scope, `DeadlineComponent${id}`, {
      platform: props.osType,
      version: props.imageVersion,
      uri: deadlineComponentDoc.s3ObjectUrl,
      description: 'Installs Deadline',
      name: `Deadline${id}`,
    });

    // Create a list of the Deadline component any other user defined components we want
    const componentArnList = [{ componentArn: deadlineComponent.attrArn }];
    props.components?.forEach(component => {
      componentArnList.push({ componentArn: component.attrArn });
    });

    // Create our image recipe that defines how to create our AMI, using our components list
    const imageRecipe = new CfnImageRecipe(scope, `DeadlineRecipe${id}`, {
      components: componentArnList,
      name: `DeadlineInstallationRecipe${id}`,
      parentImage: props.parentAmi,
      version: props.imageVersion,
    });
    imageRecipe.addDependsOn(deadlineComponent);
    props.components?.forEach(component => {
      imageRecipe.addDependsOn(component);
    })

    // Create an AMI using the recipe
    const deadlineImage = new CfnImage(scope, `DeadlineImage${id}`, {
      imageRecipeArn: imageRecipe.attrArn,
      infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
    });

    this.node.defaultChild = deadlineImage;
    this.amiId = Token.asString(deadlineImage.getAtt('ImageId'));
  }

  /**
   * Create the YAML document that has the instructions to install Deadline.
   */
  private getDeadlineComponentDoc(
    deadlineVersion: string,
    id: string,
    osType: OSType,
    scope: Construct,
  ): Asset {
    const s3Uri = osType == OSType.LINUX
      ? `s3://thinkbox-installers/Deadline/${deadlineVersion}/Linux/DeadlineClient-${deadlineVersion}-linux-x64-installer.run`
      : `s3://thinkbox-installers/Deadline/${deadlineVersion}/Windows/DeadlineClient-${deadlineVersion}-windows-installer.exe`;

    return new Asset(scope, `DeadlineComponentDoc${id}`, {
      path: templateComponent({
        templatePath: path.join(__dirname, '..', '..', 'components', `deadline-${osType.toLowerCase()}.component.template`),
        tokens: {
          s3uri: s3Uri,
          version: deadlineVersion,
        },
      }),
    });
  }

  /**
   * Create the default infrastructure config, which defines the permissions needed by Image Builder during image creation.
   */
  private createDefaultInfrastructureConfig(scope: Construct, id: string): CfnInfrastructureConfiguration {
    const imageBuilderRoleName = `DeadlineImageBuilderRole${id}`;

    const imageBuilderRole = new Role(scope, `DeadlineImageBuilderRole${id}`, {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      roleName: imageBuilderRoleName,
    });
    imageBuilderRole.addToPolicy(new PolicyStatement({
      actions: [
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
      resources: ['*'],
    }));
    imageBuilderRole.addToPolicy(new PolicyStatement({
      actions: ['logs:*'],
      resources: ['arn:aws:logs:*:*:log-group:/aws/imagebuilder/*'],
    }));

    const tagCondition: { [key: string]: any } = {};
    tagCondition['kms:EncryptionContextKeys'] = 'aws:imagebuilder:arn';
    tagCondition['aws:CalledVia'] = 'imagebuilder.amazonaws.com';
    imageBuilderRole.addToPolicy(new PolicyStatement({
      actions: [
        'kms:Decrypt',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: tagCondition,
      },
    }));

    const imageBuilderProfileName = `DeadlineImageBuilderPolicy${id}`;
    const imageBuilderProfile = new CfnInstanceProfile(scope, `DeadlineImageBuilderPolicy${id}`, {
      instanceProfileName: imageBuilderProfileName,
      roles: [ imageBuilderRoleName ],
    });

    imageBuilderProfile.addDependsOn(imageBuilderRole.node.defaultChild as CfnResource);

    const infrastructureConfiguration = new CfnInfrastructureConfiguration(
        scope,
        `InfrastructureConfig${id}`,
        {
          name: `DeadlineInfrastructureConfig${id}`,
          instanceProfileName: imageBuilderProfileName,
        });

    infrastructureConfiguration.addDependsOn(imageBuilderProfile);

    return infrastructureConfiguration;
  }
}
