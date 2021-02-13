/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CfnClientVpnAuthorizationRule,
  CfnClientVpnEndpoint,
  CfnClientVpnTargetNetworkAssociation,
  SecurityGroup,
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  Construct,
  Duration,
  Expiration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from '@aws-cdk/core';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';
// import {
//   ManagedPolicy,
//   Role,
//   ServicePrincipal,
// } from '@aws-cdk/aws-iam';
import { PrivateHostedZone } from '@aws-cdk/aws-route53';
import {
  ConfigureSpotEventPlugin,
  RenderQueue,
  Repository,
  SpotEventPluginDisplayInstanceStatus,
  SpotEventPluginFleet,
  SpotEventPluginLoggingLevel,
  SpotEventPluginPreJobTaskMode,
  SpotEventPluginState,
  SpotFleetAllocationStrategy,
  Stage,
  ThinkboxDockerRecipes,
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
      removalPolicy: {
        // TODO - Evaluate deletion protection for your own needs. This is set to false to
        // cleanly remove everything when this stack is destroyed. If you would like to ensure
        // that these resource are not accidentally deleted, you should set these properties to RemovalPolicy.RETAIN
        database: RemovalPolicy.DESTROY,
        filesystem: RemovalPolicy.DESTROY,
      },
    });

    // The following code is used to demonstrate how to use the ConfigureSpotEventPlugin if TLS is enabled.
    const host = 'renderqueue';
    const zoneName = 'deadline-test.internal';

    const hostname = {
      zone: new PrivateHostedZone(this, 'DnsZone', {
        vpc,
        zoneName: zoneName,
      }),
      hostname: host,
    };

    // NOTE: this certificate is used by ConfigureSpotEventPlugin construct below.
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

    // // Creates the Resource Tracker Access role.  This role is required to exist in your account so the resource tracker will work properly
    // // Note: If you already have a Resource Tracker IAM role in your account you can remove this code.
    // new Role(this, 'ResourceTrackerRole', {
    //   assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    //   managedPolicies: [
    //     ManagedPolicy.fromAwsManagedPolicyName('AWSThinkboxDeadlineResourceTrackerAccessPolicy'),
    //   ],
    //   roleName: 'DeadlineResourceTrackerAccessRole',
    // });

    const fleet = new SpotEventPluginFleet(this, 'SpotEventPluginFleet', {
      vpc,
      renderQueue,
      deadlineGroups: [
        'group_name',
        'group_bro*',
      ],
      instanceTypes: [
        InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      ],
      workerMachineImage: props.workerMachineImage,
      maxCapacity: 1,
      keyName: props.keyPairName,
      deadlinePools: [
        'pool1',
        'pool2',
      ],
      allocationStrategy: SpotFleetAllocationStrategy.CAPACITY_OPTIMIZED,
      validUntil: Expiration.atDate(new Date(2022, 11, 17)),
      deadlineRegion: 'some',
      logGroupProps: {
        logGroupPrefix: '/renderfarm/',
      },
    });

    // Optional: Add additional tags to both spot fleet request and spot instances.
    Tags.of(fleet).add('name', 'SEPtest');

    new ConfigureSpotEventPlugin(this, 'ConfigureSpotEventPlugin', {
      vpc,
      renderQueue: renderQueue,
      version: recipes.version,
      caCert: caCert.cert,
      spotFleets: [
        fleet,
      ],
      configuration: {
        enableResourceTracker: false,
        deleteEC2SpotInterruptedWorkers: true,
        deleteSEPTerminatedWorkers: true,
        region: this.region,
        state: SpotEventPluginState.GLOBAL_ENABLED,
        loggingLevel: SpotEventPluginLoggingLevel.VERBOSE,
        preJobTaskMode: SpotEventPluginPreJobTaskMode.CONSERVATIVE,
        idleShutdown: Duration.minutes(10),
        strictHardCap: false,
        maximumInstancesStartedPerCycle: 50,
        awsInstanceStatus: SpotEventPluginDisplayInstanceStatus.DISABLED,
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
      targetNetworkCidr: '10.0.0.0/16',
      authorizeAllGroups: true,
      description: "Allow access to whole VPC CIDR range"
    });

    renderQueue.connections.allowDefaultPortFrom(securityGroup);
  }
}
