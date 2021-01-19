/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CfnClientVpnAuthorizationRule,
  CfnClientVpnEndpoint,
  CfnClientVpnTargetNetworkAssociation,
  InstanceClass,
  InstanceSize,
  InstanceType,
  GenericLinuxImage,
  SecurityGroup,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Duration,
  Stack,
  StackProps
} from '@aws-cdk/core';
// import {
//   ManagedPolicy,
//   Role,
//   ServicePrincipal
// } from '@aws-cdk/aws-iam';
import {
  RenderQueue,
  Repository,
  Stage,
  ThinkboxDockerRecipes,
  SEPConfigurationSetup,
  SEPSpotFleet,
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
    
    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      cidr: '10.100.0.0/16',
    });

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
    
    // // Create the IAM Role for the Spot Event Plugins workers.
    // // Note: This Role MUST have a roleName that begins with "DeadlineSpot"
    // // Note if you already have a worker IAM role in your account you can remove this code.
    // const role = new Role( this, 'SpotWorkerRole', {
    //   assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    //   managedPolicies: [
    //     ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineSpotEventPluginWorkerPolicy'),
    //   ],
    //   roleName: 'DeadlineSpotWorkerRole55667',
    // });

    // // Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
    // // Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
    // new Role( this, 'ResourceTrackerRole', {
    //   assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    //   managedPolicies: [
    //     ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAccessPolicy'),
    //   ],
    //   roleName: 'DeadlineResourceTrackerAccessRole',
    // });

    const fleet = new SEPSpotFleet(this, 'TestpotFleet1', {
      vpc,
      renderQueue: renderQueue,
      // role: role,
      securityGroups: [
        workerSecurityGroup,
      ],
      deadlineGroups: [
        'group_name1',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: new GenericLinuxImage({
        [this.region]: 'ami-0f5650d87270255ae',
      }),
      targetCapacity: 1,
    });

    // WHEN
    new SEPConfigurationSetup(this, 'SEPConfigurationSetup', {
      vpc,
      renderQueue: renderQueue,
      spotFleetOptions: {
        spotFleets: [
          fleet,
        ],
        groupPools: {
          group_name1: ['pool1', 'pool2'],
        },
        enableResourceTracker: false,
      },
    });

    // TODO: remove this. Only for testing
    
    const securityGroup = new SecurityGroup(this, 'SG-VPN-RFDK', {
      vpc,
    });

    const endpoint = new CfnClientVpnEndpoint(this, 'ClientVpnEndpointRFDK', {
      description: "VPN",
      vpcId: vpc.vpcId,
      securityGroupIds: [
        securityGroup.securityGroupId,
      ],
      authenticationOptions: [{ 
        type: "certificate-authentication",
        mutualAuthentication: {
          clientRootCertificateChainArn: "arn:aws:acm:us-east-1:693238537026:certificate/5ce1c76e-c2e1-4da1-b47a-8273af60a766",
        },
      }],
      clientCidrBlock: '10.200.0.0/16',
      connectionLogOptions: {
        enabled: false,
      },
      serverCertificateArn: "arn:aws:acm:us-east-1:693238537026:certificate/acc475c0-eaf1-4d6a-9367-d294927565d6",
    });

    let i = 0;
    vpc.privateSubnets.map(subnet => {
      new CfnClientVpnTargetNetworkAssociation(this, `ClientVpnNetworkAssociation${i}`, {
        clientVpnEndpointId: endpoint.ref,
        subnetId: subnet.subnetId,
      });
      i++;
    });

    new CfnClientVpnAuthorizationRule(this, 'ClientVpnAuthRule', {
      clientVpnEndpointId: endpoint.ref,
      targetNetworkCidr: '10.100.0.0/16',
      authorizeAllGroups: true,
      description: "Allow access to whole VPC CIDR range"
    });

    renderQueue.connections.allowDefaultPortFrom(securityGroup);
  }
}
