/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
} from '@aws-cdk/assert';
import {
  GenericWindowsImage,
  InstanceClass,
  InstanceSize,
  InstanceType, IVpc,
  SecurityGroup,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  DockerImageAsset,
} from '@aws-cdk/aws-ecr-assets';
import {
  Cluster,
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  ISecret,
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import {
  Stack,
} from '@aws-cdk/core';
import {
  IRenderQueue,
  IVersion,
  IWorkerFleet,
  RenderQueue,
  Repository,
  UsageBasedLicense,
  UsageBasedLicensing,
  UsageBasedLicensingImages,
  VersionQuery,
  WorkerInstanceFleet,
} from '../lib';

let stack: Stack;
let vpc: IVpc;
let rcsImage: ContainerImage;
let renderQueue: IRenderQueue;
let lfCluster: Cluster;
let certSecret: ISecret;
let workerFleet: IWorkerFleet;
let dockerContainer: DockerImageAsset;
let deadlineVersion: IVersion;
let images: UsageBasedLicensingImages;

beforeEach(() => {
  stack = new Stack(undefined, undefined, {
    env: {
      region: 'us-east-1',
    },
  });

  deadlineVersion = VersionQuery.exact(stack, 'Version', {
    majorVersion: 10,
    minorVersion: 1,
    releaseVersion: 9,
    patchVersion: 1,
  });

  expect(deadlineVersion.linuxFullVersionString).toBeDefined();

  vpc = new Vpc(stack, 'VPC');
  rcsImage = ContainerImage.fromDockerImageAsset(new DockerImageAsset(stack, 'Image', {
    directory: __dirname,
  }));
  renderQueue = new RenderQueue(stack, 'RQ-NonDefaultPort', {
    version: deadlineVersion,
    vpc,
    images: { remoteConnectionServer: rcsImage },
    repository: new Repository(stack, 'RepositoryNonDefault', {
      vpc,
      version: deadlineVersion,
    }),
  });

  lfCluster = new Cluster(stack, 'licenseForwarderCluster', {
    vpc,
  });
  certSecret = Secret.fromSecretArn(lfCluster, 'CertSecret', 'arn:aws:secretsmanager:us-west-2:675872700355:secret:CertSecret-j1kiFz');

  dockerContainer = new  DockerImageAsset(lfCluster, 'license-forwarder', {
    directory: __dirname,
  });
  images = {
    licenseForwarder: ContainerImage.fromDockerImageAsset(dockerContainer),
  };

  workerFleet = new WorkerInstanceFleet(stack, 'workerFleet', {
    vpc,
    workerMachineImage: new GenericWindowsImage({
      'us-east-1': 'ami-any',
    }),
    renderQueue,
    securityGroup: SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-123456789', {
      allowAllOutbound: false,
    }),
  });
});

test('configures deployment configuration', () => {
  // WHEN
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    certificateSecret: certSecret,
    memoryLimitMiB: 1024,
    licenses: [UsageBasedLicense.forVray()],
    renderQueue,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
    DeploymentConfiguration: {
      MaximumPercent: 100,
      MinimumHealthyPercent: 0,
    },
  }));
});

test('default ECS stack for License Forwarder is created correctly', () => {
  // WHEN
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    certificateSecret: certSecret,
    memoryLimitMiB: 3 * 1024,
    licenses: [UsageBasedLicense.forVray()],
    renderQueue,
  });

  // THEN
  expectCDK(stack).to(haveResource('AWS::ECS::Cluster'));
  expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      {
        Environment: arrayWith(
          {
            Name: 'UBL_CERTIFICATES_URI',
            Value: 'arn:aws:secretsmanager:us-west-2:675872700355:secret:CertSecret-j1kiFz',
          },
          {
            Name: 'UBL_LIMITS',
            Value: 'vray:2147483647',
          },
        ),
        Essential: true,
        Image: {},
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': {},
            'awslogs-stream-prefix': 'docker',
            'awslogs-region': 'us-east-1',
          },
        },
        Memory: 3072,
        Name: 'Container',
        Ulimits: [
          {
            HardLimit: 200000,
            Name: 'nofile',
            SoftLimit: 200000,
          },
          {
            HardLimit: 64000,
            Name: 'nproc',
            SoftLimit: 64000,
          },
        ],
      },
    ],
    ExecutionRoleArn: {},
    NetworkMode: 'host',
    RequiresCompatibilities: [ 'EC2' ],
    TaskRoleArn: {},
  }));
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    MinSize: '1',
    MaxSize: '1',
    VPCZoneIdentifier: [
      {
        Ref: 'VPCPrivateSubnet1Subnet8BCA10E0',
      },
      {
        Ref: 'VPCPrivateSubnet2SubnetCFCDAA7A',
      },
    ],
  }));
});

test('License Forwarder capacity is set correctly', () => {
  // WHEN
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    certificateSecret: certSecret,
    memoryLimitMiB: 3 * 1024,
    licenses: [UsageBasedLicense.forVray()],
    desiredCount: 2,
    renderQueue,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    MinSize: '2',
    MaxSize: '2',
  }));
});

test('License Forwarder subnet selection', () => {
  // WHEN
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    certificateSecret: certSecret,
    memoryLimitMiB: 3 * 1024,
    licenses: [UsageBasedLicense.forVray()],
    vpcSubnets: { subnetType: SubnetType.PUBLIC },
    renderQueue,
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
    VPCZoneIdentifier: [
      {
        Ref: 'VPCPublicSubnet1SubnetB4246D30',
      },
      {
        Ref: 'VPCPublicSubnet2Subnet74179F39',
      },
    ],
  }));
});

test('test license limits', () => {
  // WHEN
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    memoryLimitMiB: 2 * 1024,
    certificateSecret: certSecret,
    instanceType: InstanceType.of(InstanceClass.C4, InstanceSize.LARGE),
    logGroupProps: {logGroupPrefix: 'licenseForwarderTest', bucketName: 'logS3Bucket'},
    renderQueue,
    licenses: [
      UsageBasedLicense.forMaya(10),
      UsageBasedLicense.forVray(10),
    ],
  });

  // THEN
  expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      {
        Environment: arrayWith(
          {
            Name: 'UBL_CERTIFICATES_URI',
            Value: 'arn:aws:secretsmanager:us-west-2:675872700355:secret:CertSecret-j1kiFz',
          },
          {
            Name: 'UBL_LIMITS',
            Value: 'maya:10;vray:10',
          },
        ),
        Memory: 2048,
      },
    ],
  }));
  expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    ToPort: 8080,
  }));
});

test.each([
  [UsageBasedLicense.for3dsMax(10), [27002]],
  [UsageBasedLicense.forArnold(10), [5056, 7056]],
  [UsageBasedLicense.forCinema4D(10), [5057, 7057]],
  [UsageBasedLicense.forClarisse(10), [40500]],
  [UsageBasedLicense.forHoudini(10), [1715]],
  [UsageBasedLicense.forKatana(10), [4101, 6101]],
  [UsageBasedLicense.forKeyShot(10), [27003, 2703]],
  [UsageBasedLicense.forKrakatoa(10), [27000, 2700]],
  [UsageBasedLicense.forMantra(10), [1716]],
  [UsageBasedLicense.forMaxwell(10), [5055, 7055]],
  [UsageBasedLicense.forMaya(10), [27002, 2702]],
  [UsageBasedLicense.forNuke(10), [4101, 6101]],
  [UsageBasedLicense.forRealFlow(10), [5055, 7055]],
  [UsageBasedLicense.forRedShift(10), [5054, 7054]],
  [UsageBasedLicense.forVray(10), [30306]],
  [UsageBasedLicense.forYeti(10), [5053, 7053]],
])('Test open port for license type', ( license: UsageBasedLicense, ports: number[]) => {
  // WHEN
  const licenseForwarder = new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    certificateSecret: certSecret,
    instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.LARGE),
    licenses: [
      license,
    ],
    memoryLimitMiB: 2 * 1024,
    renderQueue,
    images,
  });

  licenseForwarder.grantPortAccess(workerFleet, [license]);

  // THEN
  ports.forEach( port => {
    expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      ToPort: port,
    }));
  });
});

// Without any licenses
expect(() => {
  new UsageBasedLicensing(stack, 'licenseForwarder', {
    vpc,
    images,
    memoryLimitMiB: 2 * 1024,
    certificateSecret: certSecret,
    licenses: [],
    renderQueue,
  });
}).toThrowError('Should be specified at least one license with defined limit.');
