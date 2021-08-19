/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  arrayWith,
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  stringLike,
} from '@aws-cdk/assert';
import {
  GenericWindowsImage,
  IVpc,
  SecurityGroup,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  DockerImageAsset,
} from '@aws-cdk/aws-ecr-assets';
import {
  ContainerImage,
} from '@aws-cdk/aws-ecs';
import {
  ILogGroup,
} from '@aws-cdk/aws-logs';
import {
  ISecret,
  Secret,
} from '@aws-cdk/aws-secretsmanager';
import {
  App,
  CfnElement,
  Stack,
} from '@aws-cdk/core';

import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
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

const env = {
  region: 'us-east-1',
};
let app: App;
let certificateSecret: ISecret;
let versionedInstallers: IVersion;
let dependencyStack: Stack;
let dockerContainer: DockerImageAsset;
let images: UsageBasedLicensingImages;
let licenses: UsageBasedLicense[];
let rcsImage: ContainerImage;
let renderQueue: RenderQueue;
let stack: Stack;
let vpc: IVpc;
let workerFleet: IWorkerFleet;

describe('UsageBasedLicensing', () => {
  beforeEach(() => {
    // GIVEN
    app = new App();

    dependencyStack = new Stack(app, 'DependencyStack', { env });

    versionedInstallers = new VersionQuery(dependencyStack, 'VersionQuery');

    vpc = new Vpc(dependencyStack, 'VPC');
    rcsImage = ContainerImage.fromDockerImageAsset(new DockerImageAsset(dependencyStack, 'Image', {
      directory: __dirname,
    }));
    renderQueue = new RenderQueue(dependencyStack, 'RQ-NonDefaultPort', {
      vpc,
      images: { remoteConnectionServer: rcsImage },
      repository: new Repository(dependencyStack, 'RepositoryNonDefault', {
        vpc,
        version: versionedInstallers,
        secretsManagementSettings: { enabled: false },
      }),
      trafficEncryption: { externalTLS: { enabled: false } },
      version: versionedInstallers,
    });

    stack = new Stack(app, 'Stack', { env });
    certificateSecret = Secret.fromSecretArn(stack, 'CertSecret', 'arn:aws:secretsmanager:us-west-2:675872700355:secret:CertSecret-j1kiFz');
    dockerContainer = new  DockerImageAsset(stack, 'license-forwarder', {
      directory: __dirname,
    });
    images = {
      licenseForwarder: ContainerImage.fromDockerImageAsset(dockerContainer),
    };
    licenses = [UsageBasedLicense.forMaya()];
  });

  test('creates an ECS cluster', () => {
    // WHEN
    new UsageBasedLicensing(stack, 'UBL', {
      certificateSecret,
      images,
      licenses,
      renderQueue,
      vpc,
    });
    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::ECS::Cluster'));
  });

  describe('creates an ASG', () => {
    test('defaults', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
        MinSize: '1',
        MaxSize: '1',
        VPCZoneIdentifier: [
          {
            'Fn::ImportValue': stringLike(`${dependencyStack.stackName}:ExportsOutputRefVPCPrivateSubnet1Subnet*`),
          },
          {
            'Fn::ImportValue': stringLike(`${dependencyStack.stackName}:ExportsOutputRefVPCPrivateSubnet2Subnet*`),
          },
        ],
      }));
    });

    test('capacity can be specified', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'licenseForwarder', {
        certificateSecret,
        desiredCount: 2,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
        MinSize: '2',
        MaxSize: '2',
      }));
    });

    test('gives write access to log group', () => {
      // GIVEN
      const ubl = new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // WHEN
      const logGroup = ubl.node.findChild('UBLLogGroup') as ILogGroup;
      const asgRoleLogicalId = Stack.of(ubl).getLogicalId(ubl.asg.role.node.defaultChild as CfnElement);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: arrayWith(
            {
              Action: arrayWith(
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ),
              Effect: 'Allow',
              Resource: stack.resolve(logGroup.logGroupArn),
            },
          ),
          Version: '2012-10-17',
        },
        Roles: arrayWith(
          { Ref: asgRoleLogicalId },
        ),
      }));
    });

    test('uses the supplied security group', () => {
      const securityGroup = new SecurityGroup(stack, 'UblSecurityGroup', {
        vpc,
      });
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
        securityGroup,
      });
      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
        SecurityGroups: arrayWith(stack.resolve(securityGroup.securityGroupId)),
      }));
    });
  });

  describe('creates an ECS service', () => {
    test('associated with the cluster', () => {
      // WHEN
      const ubl = new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
        Cluster: { Ref: stack.getLogicalId(ubl.cluster.node.defaultChild as CfnElement) },
      }));
    });

    describe('DesiredCount', () => {
      test('defaults to 1', () => {
        // WHEN
        new UsageBasedLicensing(stack, 'UBL', {
          certificateSecret,
          images,
          licenses,
          renderQueue,
          vpc,
        });

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
          DesiredCount: 1,
        }));
      });

      test('can be specified', () => {
        // GIVEN
        const desiredCount = 2;

        // WHEN
        new UsageBasedLicensing(stack, 'UBL', {
          certificateSecret,
          images,
          licenses,
          renderQueue,
          vpc,
          desiredCount,
        });

        // THEN
        expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
          DesiredCount: desiredCount,
        }));
      });
    });

    test('sets launch type to EC2', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
        LaunchType: 'EC2',
      }));
    });

    test('sets distinct instance placement constraint', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
        PlacementConstraints: arrayWith(
          { Type: 'distinctInstance' },
        ),
      }));
    });

    test('uses the task definition', () => {
      // WHEN
      const ubl = new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
        TaskDefinition: { Ref: stack.getLogicalId(ubl.service.taskDefinition.node.defaultChild as CfnElement) },
      }));
    });

    test('with the correct deployment configuration', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::Service', {
        DeploymentConfiguration: {
          MaximumPercent: 100,
          MinimumHealthyPercent: 0,
        },
      }));
    });
  });

  describe('creates a task definition', () => {
    test('container name is LicenseForwarderContainer', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Name: 'LicenseForwarderContainer',
          },
        ],
      }));
    });

    test('container is marked essential', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Essential: true,
          },
        ],
      }));
    });

    test('with increased ulimits', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
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
      }));
    });

    test('with awslogs log driver', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            LogConfiguration: {
              LogDriver: 'awslogs',
              Options: {
                'awslogs-group': {},
                'awslogs-stream-prefix': 'LicenseForwarder',
                'awslogs-region': env.region,
              },
            },
          },
        ],
      }));
    });

    test('configures UBL certificates', () => {
      // GIVEN
      const ubl = new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // WHEN
      const taskRoleLogicalId = Stack.of(ubl).getLogicalId(ubl.service.taskDefinition.taskRole.node.defaultChild as CfnElement);

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Environment: arrayWith(
              {
                Name: 'UBL_CERTIFICATES_URI',
                Value: certificateSecret.secretArn,
              },
            ),
          },
        ],
        TaskRoleArn: {
          'Fn::GetAtt': [
            taskRoleLogicalId,
            'Arn',
          ],
        },
      }));

      expectCDK(stack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              Effect: 'Allow',
              Resource: certificateSecret.secretArn,
            },
          ],
          Version: '2012-10-17',
        },
        Roles: [
          { Ref: Stack.of(ubl).getLogicalId(ubl.service.taskDefinition.taskRole.node.defaultChild as CfnElement) },
        ],
      }));
    });

    test('uses host networking', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        NetworkMode: 'host',
      }));
    });

    test('is marked EC2 compatible only', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: [ 'EC2' ],
      }));
    });
  });

  test('License Forwarder subnet selection', () => {
    // GIVEN
    const publicSubnetIds = ['PublicSubnet1', 'PublicSubnet2'];
    const vpcFromAttributes = Vpc.fromVpcAttributes(dependencyStack, 'AttrVpc', {
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      vpcId: 'vpcid',
      publicSubnetIds,
    });

    // WHEN
    new UsageBasedLicensing(stack, 'licenseForwarder', {
      certificateSecret,
      images,
      licenses,
      renderQueue,
      vpc: vpcFromAttributes,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
    });

    // THEN
    expectCDK(stack).to(haveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
      VPCZoneIdentifier: publicSubnetIds,
    }));
  });

  test.each([
    'test-prefix/',
    '',
  ])('License Forwarder is created with correct LogGroup prefix %s', (testPrefix: string) => {
    // GIVEN
    const id = 'licenseForwarder';

    // WHEN
    new UsageBasedLicensing(stack, id, {
      certificateSecret,
      images,
      licenses,
      renderQueue,
      vpc,
      logGroupProps: {
        logGroupPrefix: testPrefix,
      },
    });

    // THEN
    expectCDK(stack).to(haveResource('Custom::LogRetention', {
      LogGroupName: testPrefix + id,
    }));
  });

  describe('license limits', () => {
    test('multiple licenses with limits', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'licenseForwarder', {
        vpc,
        images,
        certificateSecret,
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
                Name: 'UBL_LIMITS',
                Value: 'maya:10;vray:10',
              },
            ),
          },
        ],
      }));
    });

    test.each([
      ['3dsMax', UsageBasedLicense.for3dsMax(10), [27002]],
      ['Arnold', UsageBasedLicense.forArnold(10), [5056, 7056]],
      ['Cinema4D', UsageBasedLicense.forCinema4D(10), [5057, 7057]],
      ['Clarisse', UsageBasedLicense.forClarisse(10), [40500]],
      ['Houdini', UsageBasedLicense.forHoudini(10), [1715]],
      ['Katana', UsageBasedLicense.forKatana(10), [4151, 6101]],
      ['KeyShot', UsageBasedLicense.forKeyShot(10), [27003, 2703]],
      ['Krakatoa', UsageBasedLicense.forKrakatoa(10), [27000, 2700]],
      ['Mantra', UsageBasedLicense.forMantra(10), [1716]],
      ['Maxwell', UsageBasedLicense.forMaxwell(10), [5555, 7055]],
      ['Maya', UsageBasedLicense.forMaya(10), [27002, 2702]],
      ['Nuke', UsageBasedLicense.forNuke(10), [4101, 6101]],
      ['RealFlow', UsageBasedLicense.forRealFlow(10), [5055, 7055]],
      ['RedShift', UsageBasedLicense.forRedShift(10), [5054, 7054]],
      ['Vray', UsageBasedLicense.forVray(10), [30306]],
      ['Yeti', UsageBasedLicense.forYeti(10), [5053, 7053]],
    ])('Test open port for license type %s', (_licenseName: string, license: UsageBasedLicense, ports: number[]) => {
      // GIVEN
      const ubl = new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });
      const workerStack = new Stack(app, 'WorkerStack', { env });
      workerFleet = new WorkerInstanceFleet(workerStack, 'workerFleet', {
        vpc,
        workerMachineImage: new GenericWindowsImage({
          'us-east-1': 'ami-any',
        }),
        renderQueue,
        securityGroup: SecurityGroup.fromSecurityGroupId(workerStack, 'SG', 'sg-123456789', {
          allowAllOutbound: false,
        }),
      });

      // WHEN
      ubl.grantPortAccess(workerFleet, [license]);

      // THEN
      ports.forEach( port => {
        expectCDK(workerStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: port,
          GroupId: {
            'Fn::ImportValue': stringLike(`${Stack.of(ubl).stackName}:ExportsOutputFnGetAttUBLClusterASGInstanceSecurityGroup*`),
          },
          SourceSecurityGroupId: 'sg-123456789',
        }));
      });
    });

    test('requires one usage based license', () => {
      // Without any licenses
      expect(() => {
        new UsageBasedLicensing(stack, 'licenseForwarder', {
          vpc,
          images,
          certificateSecret: certificateSecret,
          licenses: [],
          renderQueue,
        });
      }).toThrowError('Should be specified at least one license with defined limit.');
    });
  });

  describe('configures render queue', () => {
    test('adds ingress rule for asg', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 8080,
        ToPort: 8080,
        GroupId: {
          'Fn::ImportValue': stringLike(`${Stack.of(renderQueue).stackName}:ExportsOutputFnGetAttRQNonDefaultPortLBSecurityGroup*`),
        },
        SourceSecurityGroupId: {
          'Fn::GetAtt': [
            'UBLClusterASGInstanceSecurityGroupAA1A7A2D',
            'GroupId',
          ],
        },
      }));
    });

    test('sets RENDER_QUEUE_URI environment variable', () => {
      // WHEN
      new UsageBasedLicensing(stack, 'UBL', {
        certificateSecret,
        images,
        licenses,
        renderQueue,
        vpc,
      });

      // THEN
      expectCDK(stack).to(haveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Environment: arrayWith(
              {
                Name: 'RENDER_QUEUE_URI',
                Value: {
                  'Fn::Join': [
                    '',
                    [
                      'http://',
                      {
                        'Fn::ImportValue': stringLike(`${Stack.of(renderQueue).stackName}:ExportsOutputFnGetAttRQNonDefaultPortLB*`),
                      },
                      ':8080',
                    ],
                  ],
                },
              },
            ),
          },
        ],
      }));
    });
  });

  describe('tagging', () => {
    testConstructTags({
      constructName: 'UsageBasedLicensing',
      createConstruct: () => {
        new UsageBasedLicensing(stack, 'UBL', {
          certificateSecret,
          images,
          licenses,
          renderQueue,
          vpc,
        });
        return stack;
      },
      resourceTypeCounts: {
        'AWS::ECS::Cluster': 1,
        'AWS::EC2::SecurityGroup': 1,
        'AWS::IAM::Role': 5,
        'AWS::AutoScaling::AutoScalingGroup': 1,
        'AWS::Lambda::Function': 1,
        'AWS::SNS::Topic': 1,
        'AWS::ECS::TaskDefinition': 1,
        'AWS::ECS::Service': 1,
      },
    });
  });
});
