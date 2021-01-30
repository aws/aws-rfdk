/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Duration,
  Stack,
  StackProps,
  Tags,
} from '@aws-cdk/core';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import {
  RenderQueue,
  Repository,
  Stage,
  ThinkboxDockerRecipes,
  SEPConfigurationSetup,
  SEPSpotFleet,
} from 'aws-rfdk/deadline';
import { X509CertificatePem } from 'aws-rfdk';

/**
 * Properties for {@link SEPStack}.
 */
export interface SEPStackProps extends StackProps {

  /**
   * The path to the directory where the staged Deadline Docker recipes are.
   */
  readonly dockerRecipesStagePath: string;

  /**
   * The {@link IMachineImage} to use for Workers (needs Deadline Client installed).
   */
  readonly workerMachineImage: IMachineImage;

  /**
   * The name of the EC2 keypair to associate with Worker nodes.
   */
  readonly keyPairName?: string;
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

    // The following code is used to demonstrate how to use the SEPConfigurationSetup if TLS is enabled.
    const host = 'renderqueue';
    const zoneName = 'deadline-test.internal';

    const hostname = {
      zone: new PrivateHostedZone(this, 'DnsZone', {
        vpc,
        zoneName: zoneName,
      }),
      hostname: host,
    };

    // NOTE: this certificate is used by SEPConfigurationSetup construct below.
    const caCert = new X509CertificatePem(this, 'RootCA', {
      subject: {
        cn: 'SampleRootCA',
      },
    });

    const trafficEncryption = {
      externalTLS: {
        rfdkCertificate: new X509CertificatePem(this, 'RQCert', {
          subject: {
            cn: `${host}.${zoneName}`,
            o: 'RFDK-Sample',
            ou: 'RenderQueueExternal',
          },
          signingCertificate: caCert,
        }),
        internalProtocol: ApplicationProtocol.HTTPS,
      },
    };

    const renderQueue = new RenderQueue(this, 'RenderQueue', {
      vpc,
      version: recipes.version,
      images: recipes.renderQueueImages,
      repository: repository,
      // TODO - Evaluate deletion protection for your own needs. This is set to false to
      // cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that this resource is not accidentally deleted, you should set this to true.
      deletionProtection: false,
      hostname,
      trafficEncryption,
    });

    // Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
    // Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
    new Role(this, 'ResourceTrackerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAccessPolicy'),
      ],
      roleName: 'DeadlineResourceTrackerAccessRole',
    });

    // Create the IAM Role for the spot fleet.
    // Note if you already have a worker IAM role in your account you can use it instead.
    const fleetRole = new Role(this, 'FleetRole', {
      assumedBy: new ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2SpotFleetTaggingRole', 'arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole'),
      ],
    });

    // Adds the following IAM managed Policies to the Render Queue so it has the necessary permissions
    // to run the Spot Event Plugin and launch a Resource Tracker:
    // * AWSThinkboxDeadlineSpotEventPluginAdminPolicy
    // * AWSThinkboxDeadlineResourceTrackerAdminPolicy
    // Also, adds policies that allow the Render Queue to tag spot fleet requests and to pass the spot fleet role.
    renderQueue.addSEPPolicies(true, [fleetRole.roleArn]);

    const fleet = new SEPSpotFleet(this, 'SEPSpotFleet', {
      vpc,
      renderQueue,
      fleetRole,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: props.workerMachineImage,
      targetCapacity: 1,
      keyName: props.keyPairName,
    });

    // Optinal: Add additional tags to both spot fleet request and spot instances.
    Tags.of(fleet).add('name', 'SEPtest');

    new SEPConfigurationSetup(this, 'SEPConfigurationSetup', {
      vpc,
      renderQueue: renderQueue,
      version: recipes.version,
      caCert: caCert.cert,
      spotFleetOptions: {
        spotFleets: [
          fleet,
        ],
        enableResourceTracker: true,
        region: this.region,
      },
    });
  }
}
