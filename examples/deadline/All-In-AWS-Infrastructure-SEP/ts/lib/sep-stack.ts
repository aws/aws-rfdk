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
} from 'aws-cdk-lib/aws-ec2';
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { PrivateHostedZone } from 'aws-cdk-lib/aws-route53';
import {
  ConfigureSpotEventPlugin,
  RenderQueue,
  Repository,
  SpotEventPluginFleet,
  Stage,
  ThinkboxDockerRecipes,
} from 'aws-rfdk/deadline';
import { X509CertificatePem } from 'aws-rfdk';
import { Construct } from 'constructs';

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
   * Whether the DeadlineResourceTracker stack and supporting resources already exist or not.
   */
  readonly createResourceTrackerRole: boolean;
}

export class SEPStack extends Stack {

  /**
   * Initializes a new instance of SEPStack.
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
      repositoryInstallationTimeout: Duration.minutes(30),
      // TODO - Evaluate deletion protection for your own needs. These properties are set to RemovalPolicy.DESTROY
      // to cleanly remove everything when this stack is destroyed. If you would like to ensure
      // that these resources are not accidentally deleted, you should set these properties to RemovalPolicy.RETAIN
      // or just remove the removalPolicy parameter.
      removalPolicy: {
        database: RemovalPolicy.DESTROY,
        filesystem: RemovalPolicy.DESTROY,
      },
    });

    const host = 'renderqueue';
    const zoneName = 'deadline-test.internal';

    const hostname = {
      zone: new PrivateHostedZone(this, 'DnsZone', {
        vpc,
        zoneName: zoneName,
      }),
      hostname: host,
    };

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

    if (props.createResourceTrackerRole) {
      // Creates the Resource Tracker Access role. This role is required to exist in your account so the resource tracker will work properly
      new Role(this, 'ResourceTrackerRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAccessPolicy'),
        ],
        roleName: 'DeadlineResourceTrackerAccessRole',
      });
    }

    const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
      vpc,
      renderQueue,
      deadlineGroups: [
        'group_name',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: props.workerMachineImage,
      maxCapacity: 1,
    });

    // Optional: Add additional tags to both spot fleet request and spot instances.
    Tags.of(fleet).add('name', 'SEPtest');

    new ConfigureSpotEventPlugin(this, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue,
      spotFleets: [
        fleet,
      ],
      configuration: {
        enableResourceTracker: true,
      },
    });
  }
}
