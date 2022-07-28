/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  App,
  CfnElement,
  Stack,
} from 'aws-cdk-lib';
import {
  Annotations,
  Match,
  Template,
} from 'aws-cdk-lib/assertions';
import {
  GenericWindowsImage,
  IVpc,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  DockerImageAsset,
} from 'aws-cdk-lib/aws-ecr-assets';
import {
  CfnService,
  ContainerImage,
} from 'aws-cdk-lib/aws-ecs';
import {
  ILogGroup,
} from 'aws-cdk-lib/aws-logs';
import {
  ISecret,
  Secret,
} from 'aws-cdk-lib/aws-secretsmanager';

import {
  testConstructTags,
} from '../../core/test/tag-helpers';
import {
  IVersion,
  IWorkerFleet,
  RenderQueue,
  Repository,
  SecretsManagementRegistrationStatus,
  SecretsManagementRole,
  SubnetIdentityRegistrationSettingsProps,
  UsageBasedLicense,
  UsageBasedLicensing,
  UsageBasedLicensingImages,
  UsageBasedLicensingProps,
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

const DEFAULT_CONSTRUCT_ID = 'UBL';

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
      }),
      version: versionedInstallers,
    });
    jest.spyOn(renderQueue, 'configureSecretsManagementAutoRegistration');

    stack = new Stack(app, 'Stack', { env });
    certificateSecret = Secret.fromSecretCompleteArn(stack, 'CertSecret', 'arn:aws:secretsmanager:us-west-2:675872700355:secret:CertSecret-j1kiFz');
    dockerContainer = new  DockerImageAsset(stack, 'license-forwarder', {
      directory: __dirname,
    });
    images = {
      licenseForwarder: ContainerImage.fromDockerImageAsset(dockerContainer),
    };
    licenses = [UsageBasedLicense.forMaya()];
  });

  function createUbl(props?: Partial<UsageBasedLicensingProps>): UsageBasedLicensing {
    return new UsageBasedLicensing(stack, DEFAULT_CONSTRUCT_ID, {
      certificateSecret,
      images,
      licenses,
      renderQueue,
      vpc,
      ...props,
    });
  }

  test('vpcSubnets specified => does not emit warnings', () => {
    // GIVEN
    const vpcSubnets: SubnetSelection = {
      subnetType: SubnetType.PRIVATE_WITH_NAT,
    };

    // WHEN
    const ubl = createUbl({
      vpcSubnets,
    });

    // THEN
    Annotations.fromStack(stack).hasNoInfo(`/${ubl.node.path}`, Match.anyValue());
    Annotations.fromStack(stack).hasNoWarning(`/${ubl.node.path}`, Match.anyValue());
    Annotations.fromStack(stack).hasNoError(`/${ubl.node.path}`, Match.anyValue());
  });

  test('vpcSubnets not specified => emits warning about dedicated subnets', () => {
    // WHEN
    const ubl = createUbl();

    // THEN
    Annotations.fromStack(stack).hasWarning(
      `/${ubl.node.path}`,
      'Deadline Secrets Management is enabled on the Repository and VPC subnets have not been supplied. Using dedicated subnets is recommended. See https://github.com/aws/aws-rfdk/blobs/release/packages/aws-rfdk/lib/deadline/README.md#using-dedicated-subnets-for-deadline-components',
    );
  });

  describe('configures auto registration', () => {
    test('default to private subnets', () => {
      // WHEN
      const ubl = createUbl();

      // THEN
      const expectedCall: SubnetIdentityRegistrationSettingsProps = {
        dependent: ubl.service.node.defaultChild as CfnService,
        registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
        role: SecretsManagementRole.CLIENT,
        vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
      };

      // THEN
      expect(renderQueue.configureSecretsManagementAutoRegistration).toHaveBeenCalledWith(expectedCall);
    });

    test.each<[SubnetSelection]>([
      [{
        subnetType: SubnetType.PUBLIC,
      }],
    ])('%s', (vpcSubnets) => {
      // WHEN
      const ubl = createUbl({
        vpcSubnets,
      });

      // THEN
      const expectedCall: SubnetIdentityRegistrationSettingsProps = {
        dependent: ubl.service.node.defaultChild as CfnService,
        registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
        role: SecretsManagementRole.CLIENT,
        vpc,
        vpcSubnets,
      };

      // THEN
      expect(renderQueue.configureSecretsManagementAutoRegistration).toHaveBeenCalledWith(expectedCall);
    });
  });

  test('creates an ECS cluster', () => {
    // WHEN
    createUbl();

    // THEN
    Template.fromStack(stack).resourceCountIs('AWS::ECS::Cluster', 1);
  });

  describe('creates an ASG', () => {
    test('defaults', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
        MinSize: '1',
        MaxSize: '1',
        VPCZoneIdentifier: [
          {
            'Fn::ImportValue': Match.stringLikeRegexp(`${dependencyStack.stackName}:ExportsOutputRefVPCPrivateSubnet1Subnet.*`),
          },
          {
            'Fn::ImportValue': Match.stringLikeRegexp(`${dependencyStack.stackName}:ExportsOutputRefVPCPrivateSubnet2Subnet.*`),
          },
        ],
      });
    });

    test('capacity can be specified', () => {
      // WHEN
      createUbl({
        desiredCount: 2,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
        MinSize: '2',
        MaxSize: '2',
      });
    });

    test('gives write access to log group', () => {
      // GIVEN
      const ubl = createUbl();

      // WHEN
      const logGroup = ubl.node.findChild(`${DEFAULT_CONSTRUCT_ID}LogGroup`) as ILogGroup;
      const asgRoleLogicalId = Stack.of(ubl).getLogicalId(ubl.asg.role.node.defaultChild as CfnElement);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: Match.arrayWith([
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ]),
              Effect: 'Allow',
              Resource: stack.resolve(logGroup.logGroupArn),
            },
          ]),
          Version: '2012-10-17',
        },
        Roles: Match.arrayWith([
          { Ref: asgRoleLogicalId },
        ]),
      });
    });

    test('uses the supplied security group', () => {
      // GIVEN
      const securityGroup = new SecurityGroup(stack, 'UblSecurityGroup', {
        vpc,
      });

      // WHEN
      createUbl({ securityGroup });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
        SecurityGroups: Match.arrayWith([stack.resolve(securityGroup.securityGroupId)]),
      });
    });
  });

  describe('creates an ECS service', () => {
    test('associated with the cluster', () => {
      // WHEN
      const ubl = createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        Cluster: { Ref: stack.getLogicalId(ubl.cluster.node.defaultChild as CfnElement) },
      });
    });

    describe('DesiredCount', () => {
      test('defaults to 1', () => {
        // WHEN
        createUbl();

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
          DesiredCount: 1,
        });
      });

      test('can be specified', () => {
        // GIVEN
        const desiredCount = 2;

        // WHEN
        createUbl({ desiredCount });

        // THEN
        Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
          DesiredCount: desiredCount,
        });
      });
    });

    test('sets launch type to EC2', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        LaunchType: 'EC2',
      });
    });

    test('sets distinct instance placement constraint', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        PlacementConstraints: Match.arrayWith([
          { Type: 'distinctInstance' },
        ]),
      });
    });

    test('uses the task definition', () => {
      // WHEN
      const ubl = createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        TaskDefinition: { Ref: stack.getLogicalId(ubl.service.taskDefinition.node.defaultChild as CfnElement) },
      });
    });

    test('with the correct deployment configuration', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        DeploymentConfiguration: {
          MaximumPercent: 100,
          MinimumHealthyPercent: 0,
        },
      });
    });
  });

  describe('creates a task definition', () => {
    test('container name is LicenseForwarderContainer', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Name: 'LicenseForwarderContainer',
          },
        ],
      });
    });

    test('container is marked essential', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Essential: true,
          },
        ],
      });
    });

    test('with increased ulimits', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
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
      });
    });

    test('with awslogs log driver', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
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
      });
    });

    test('configures UBL certificates', () => {
      // GIVEN
      const ubl = createUbl();

      // WHEN
      const taskRoleLogicalId = Stack.of(ubl).getLogicalId(ubl.service.taskDefinition.taskRole.node.defaultChild as CfnElement);

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Environment: Match.arrayWith([
              {
                Name: 'UBL_CERTIFICATES_URI',
                Value: certificateSecret.secretArn,
              },
            ]),
          },
        ],
        TaskRoleArn: {
          'Fn::GetAtt': [
            taskRoleLogicalId,
            'Arn',
          ],
        },
      });

      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              Effect: 'Allow',
              Resource: certificateSecret.secretArn,
            },
          ]),
          Version: '2012-10-17',
        },
        Roles: [
          { Ref: Stack.of(ubl).getLogicalId(ubl.service.taskDefinition.taskRole.node.defaultChild as CfnElement) },
        ],
      });
    });

    test('uses host networking', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        NetworkMode: 'host',
      });
    });

    test('is marked EC2 compatible only', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: [ 'EC2' ],
      });
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
    createUbl({
      vpc: vpcFromAttributes,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      VPCZoneIdentifier: publicSubnetIds,
    });
  });

  test.each([
    'test-prefix/',
    '',
  ])('License Forwarder is created with correct LogGroup prefix %s', (testPrefix: string) => {
    // GIVEN
    const id = DEFAULT_CONSTRUCT_ID;

    // WHEN
    createUbl({
      logGroupProps: {
        logGroupPrefix: testPrefix,
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('Custom::LogRetention', {
      LogGroupName: testPrefix + id,
    });
  });

  describe('license limits', () => {
    test('multiple licenses with limits', () => {
      // WHEN
      createUbl({
        licenses: [
          UsageBasedLicense.forMaya(10),
          UsageBasedLicense.forVray(10),
        ],
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Environment: Match.arrayWith([
              {
                Name: 'UBL_LIMITS',
                Value: 'maya:10;vray:10',
              },
            ]),
          },
        ],
      });
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
      const ubl = createUbl();
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
        Template.fromStack(workerStack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
          IpProtocol: 'tcp',
          ToPort: port,
          GroupId: {
            'Fn::ImportValue': Match.stringLikeRegexp(`${Stack.of(ubl).stackName}:ExportsOutputFnGetAttUBLClusterASGInstanceSecurityGroup.*`),
          },
          SourceSecurityGroupId: 'sg-123456789',
        });
      });
    });

    test('requires one usage based license', () => {
      // Without any licenses
      expect(() => {
        createUbl({ licenses: [] });
      }).toThrowError('Should be specified at least one license with defined limit.');
    });
  });

  describe('configures render queue', () => {
    test('adds ingress rule from UsageBasedLicensing ASG to RenderQueue ASG', () => {
      // GIVEN
      const renderQueueSecurityGroup = renderQueue.connections.securityGroups[0];

      // WHEN
      const ubl = createUbl();
      const ublSecurityGroup = ubl.connections.securityGroups[0];

      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 4433,
        ToPort: 4433,
        GroupId: stack.resolve(renderQueueSecurityGroup.securityGroupId),
        SourceSecurityGroupId: stack.resolve(ublSecurityGroup.securityGroupId),
      });
    });

    test('adds ingress rule from RenderQueue ASG to UsageBasedLicensing ASG', () => {
      // GIVEN
      const renderQueueSecurityGroup = renderQueue.backendConnections.securityGroups[0];

      // WHEN
      const ubl = createUbl();
      const ublSecurityGroup = ubl.connections.securityGroups[0];

      Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 17004,
        ToPort: 17004,
        GroupId: stack.resolve(ublSecurityGroup.securityGroupId),
        SourceSecurityGroupId: stack.resolve(renderQueueSecurityGroup.securityGroupId),
      });
    });

    test('sets RENDER_QUEUE_URI environment variable', () => {
      // WHEN
      createUbl();

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Environment: Match.arrayWith([
              {
                Name: 'RENDER_QUEUE_URI',
                Value: stack.resolve(`${renderQueue.endpoint.applicationProtocol.toLowerCase()}://${renderQueue.endpoint.socketAddress}`),
              },
            ]),
          },
        ],
      });
    });
  });

  describe('tagging', () => {
    testConstructTags({
      constructName: 'UsageBasedLicensing',
      createConstruct: () => {
        createUbl();
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
