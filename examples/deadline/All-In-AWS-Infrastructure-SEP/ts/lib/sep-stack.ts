/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SecurityGroup,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Duration,
  Stack,
  StackProps
} from '@aws-cdk/core';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal
} from '@aws-cdk/aws-iam';
import {
  RenderQueue,
  Repository,
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';

/**
 * Properties for {@link SEPStack}.
 */
export interface SEPStackProps extends StackProps {

  /**
   * The path to the directory where the staged Deadline Docker recipes are.
   */
  readonly dockerRecipesStagePath: string;
}

export class SEPStack extends Stack {

  /**
   * Initializes a new instance of {@link NetworkTier}.
   * @param scope The scope of this construct.
   * @param id The ID of this construct.
   * @param props The stack properties.
   */
  constructor(scope: Construct, id: string, props: SEPStackProps) {
    super(scope, id, props);
    
    const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });

    const recipes = new ThinkboxDockerRecipes(this, 'Image', {
      stage: Stage.fromDirectory(props.dockerRecipesStagePath),
    });
  
    const repository = new Repository(this, 'Repository', {
      vpc,
      version: recipes.version,
      repositoryInstallationTimeout: Duration.minutes(20),
    });

    const renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc,
      version: recipes.version,
      images: recipes.renderQueueImages,
      repository: repository,
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
    });

    // Adds the following IAM managed Policies to the Render Queue so it has the necessary permissions
    // to run the Spot Event Plugin and launch a Resource Tracker:
    // * AWSThinkboxDeadlineSpotEventPluginAdminPolicy
    // * AWSThinkboxDeadlineResourceTrackerAdminPolicy
    renderQueue.addSEPPolicies();

    // Create the security group that you will assign to your workers
    const workerSecurityGroup = new SecurityGroup(this, 'SpotSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'DeadlineSpotSecurityGroup',
    });
    workerSecurityGroup.connections.allowToDefaultPort(renderQueue.endpoint);
    
    // Create the IAM Role for the Spot Event Plugins workers.
    // Note: This Role MUST have a roleName that begins with "DeadlineSpot"
    // Note if you already have a worker IAM role in your account you can remove this code.
    new Role( this, 'SpotWorkerRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
      ],
      roleName: 'DeadlineSpotWorkerRole',
    });

    // Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
    // Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
    new Role( this, 'ResourceTrackerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAccessPolicy'),
      ],
      roleName: 'DeadlineResourceTrackerAccessRole',
    });
  }
}
