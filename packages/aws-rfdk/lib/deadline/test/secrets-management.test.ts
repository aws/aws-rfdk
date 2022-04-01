/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

import {
  arrayWith,
  expect as expectCDK,
  haveResourceLike,
  SynthUtils,
} from '@aws-cdk/assert';
import {
  ExecuteFileOptions,
  IVpc,
  S3DownloadOptions,
  SelectedSubnets,
  SubnetSelection,
  SubnetType,
  UserData,
  Vpc,
} from '@aws-cdk/aws-ec2';
import { CfnRole } from '@aws-cdk/aws-iam';
import { Asset } from '@aws-cdk/aws-s3-assets';
import {
  App,
  Construct,
  Fn,
  Resource,
  Stack,
} from '@aws-cdk/core';

import { DeploymentInstance, DeploymentInstanceProps } from '../../core/lib/deployment-instance';

import {
  InstanceDirectConnectProps,
  IRepository,
  IVersion,
  Repository,
  RepositoryProps,
  SecretsManagementProps,
  SecretsManagementRegistrationStatus,
  SecretsManagementRole,
  VersionQuery,
} from '../lib';
import { SecretsManagementIdentityRegistration } from '../lib/secrets-management';


class MockUserData extends UserData {
  readonly addCommands: jest.Mock<void, string[]>;
  readonly addOnExitCommands: jest.Mock<void, string[]>;
  readonly render: jest.Mock<string, []>;
  readonly addExecuteFileCommand: jest.Mock<void, [ExecuteFileOptions]>;
  readonly addS3DownloadCommand: jest.Mock<string, [S3DownloadOptions]>;
  readonly addSignalOnExitCommand: jest.Mock<void, [Resource]>;

  constructor() {
    super();
    this.addCommands = jest.fn<void, string[]>();
    this.addCommands = jest.fn<void, string[]>();
    this.addOnExitCommands = jest.fn<void, string[]>();
    this.render = jest.fn<string, []>();
    this.addExecuteFileCommand = jest.fn<void, [ExecuteFileOptions]>();
    this.addS3DownloadCommand = jest.fn<string, [S3DownloadOptions]>();
    this.addSignalOnExitCommand = jest.fn<void, [Resource]>();
  }
}

class MockDeploymentInstance extends DeploymentInstance {
  private readonly mockUserData: MockUserData;

  constructor(scope: Construct, id: string, props: DeploymentInstanceProps) {
    super(scope, id, props);
    this.mockUserData = new MockUserData();
  }

  public get userData(): MockUserData {
    return this.mockUserData;
  }
}

function writeSynthedTemplate(stack: Stack, outputFile: string) {
  const template = SynthUtils.synthesize(stack).template;
  fs.writeFileSync(outputFile, JSON.stringify(template, null, 2), { encoding: 'utf8' });
}

const DEADLINE_CLIENT_SUBNET_NAME = 'DeadlineClient';
const RENDER_QUEUE_ALB_SUBNET_NAME = 'RenderQueueALB';

describe('SecretsManagementIdentityRegistration', () => {
  let app: App;
  let dependencyStack: Stack;
  let deploymentInstanceStack: Stack;
  let stack: Stack;
  let vpc: IVpc;
  let version: IVersion;
  let repository: IRepository;
  let deploymentInstance: MockDeploymentInstance;
  let deploymentInstanceRole: CfnRole;
  let renderQueueSubnets: SelectedSubnets;
  let target: SecretsManagementIdentityRegistration;

  // @ts-ignore
  function writeSynthedTemplates() {
    writeSynthedTemplate(deploymentInstanceStack, 'deployment-instance-stack.json');
    writeSynthedTemplate(stack, 'secrets-management-stack.json');
  }

  beforeEach(() => {
    app = new App();
    dependencyStack = new Stack(app, 'DependencyStack');
    deploymentInstanceStack = new Stack(app, 'DeploymentInstanceStack');
    stack = new Stack(app, 'Stack');
    vpc = new Vpc(dependencyStack, 'Vpc', {
      subnetConfiguration: [
        {
          name: RENDER_QUEUE_ALB_SUBNET_NAME,
          subnetType: SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 28,
        },
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 28,
        },
        {
          name: DEADLINE_CLIENT_SUBNET_NAME,
          subnetType: SubnetType.PUBLIC,
          cidrMask: 28,
        },
      ],
    });
    version = new VersionQuery(dependencyStack, 'Version');
    deploymentInstance = new MockDeploymentInstance(deploymentInstanceStack, 'DeploymentInstance', {
      vpc,
    });
    renderQueueSubnets = vpc.selectSubnets({ subnetGroupName: RENDER_QUEUE_ALB_SUBNET_NAME });
  });

  describe('when Repository uses secrets management', () => {
    beforeEach(() => {
      // GIVEN
      repository = new Repository(dependencyStack, 'Repository', {
        version,
        vpc,
        secretsManagementSettings: {
          enabled: true,
        },
      });
      jest.spyOn(repository, 'configureClientInstance');
      // Get a reference to the DeploymentInstance's IAM role L1 resource
      deploymentInstanceRole = (
        deploymentInstance
          .node.findChild('ASG')
          .node.findChild('InstanceRole')
          .node.defaultChild
      ) as CfnRole;
    });

    function createTarget() {
      target = new SecretsManagementIdentityRegistration(stack, 'IdentityRegistration', {
        deploymentInstance,
        renderQueueSubnets,
        repository,
        version,
      });
    }

    describe('Deadline Client installer', () => {
      test('grant S3 read to client installer', () => {
        // WHEN
        createTarget();

        // THEN
        expectCDK(deploymentInstanceStack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Resource: arrayWith(...deploymentInstanceStack.resolve([
                  version.linuxInstallers.client.s3Bucket.bucketArn,
                  version.linuxInstallers.client.s3Bucket.arnForObjects(version.linuxInstallers.client.objectKey),
                ])),
              },
            ),
          },
          Roles: [
            deploymentInstanceStack.resolve(deploymentInstanceRole.ref),
          ],
        }));
      });

      test('downloads and executes Client installer', () => {
        // GIVEN
        const clientInstallerLocalFilename = 'clientInstallerLocalFilename';
        const userData = deploymentInstance.userData;
        userData.addS3DownloadCommand.mockReturnValueOnce(clientInstallerLocalFilename);

        // WHEN
        createTarget();

        // THEN
        expect(userData.addS3DownloadCommand).toHaveBeenCalledWith<[S3DownloadOptions]>({
          bucket: version.linuxInstallers.client.s3Bucket,
          bucketKey: version.linuxInstallers.client.objectKey,
        });
        expect(userData.addCommands).toHaveBeenCalledWith(`chmod +x "${clientInstallerLocalFilename}"`);
        expect(userData.addCommands).toHaveBeenCalledWith([
          // This is required b/c USER and HOME environment variables are not defined when running
          // user-data
          'sudo', '--login',

          // Run the Deadline Client installer
          `"${clientInstallerLocalFilename}"`,
          '--mode', 'unattended',
          '--connectiontype', 'Remote',
          '--proxyrootdir', '127.0.0.1:8080',
          '--noguimode', 'true',
          '--slavestartup', 'false',
          '--launcherdaemon', 'false',
          '--restartstalled', 'true',
          '--autoupdateoverride', 'False',
        ].join(' '));
      });
    });

    test('grants DeploymentInstance role permissions to describe subnets', () => {
      // WHEN
      createTarget();

      // THEN
      expectCDK(deploymentInstanceStack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: arrayWith(
            {
              Action: 'ec2:DescribeSubnets',
              Effect: 'Allow',
              Resource: '*',
            },
          ),
        },
        Roles: [stack.resolve(deploymentInstanceRole.ref)],
      }));
    });

    test('configures direct repository connection', () => {
      // WHEN
      createTarget();

      // THEN
      expect(repository.configureClientInstance).toHaveBeenCalledWith<[InstanceDirectConnectProps]>({
        host: deploymentInstance,
        mountPoint: expect.any(String),
      });
    });

    test('grants DeploymentInstance read access to the Deadline Secrets Management admin credentials secret', () => {
      // WHEN
      createTarget();

      // THEN
      expectCDK(deploymentInstanceStack).to(haveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: arrayWith(
            {
              Action: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              Effect: 'Allow',
              Resource: deploymentInstanceStack.resolve(repository.secretsManagementSettings.credentials!.secretArn),
            },
          ),
        },
        Roles: [
          deploymentInstanceStack.resolve(deploymentInstanceRole.ref),
        ],
      }));
    });

    describe('Identity registration settings script', () => {
      function getIdentityRegistrationSettingsScript() {
        return target.node.findChild('ConfigureIdentityRegistrationSettingScript') as Asset;
      }

      test('DeploymentInstance granted S3 read access', () => {
        // WHEN
        createTarget();
        const identityRegistrationSettingsScript = getIdentityRegistrationSettingsScript();

        // THEN
        expectCDK(deploymentInstanceStack).to(haveResourceLike('AWS::IAM::Policy', {
          PolicyDocument: {
            Statement: arrayWith(
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Resource: deploymentInstanceStack.resolve([
                  identityRegistrationSettingsScript.bucket.bucketArn,
                  identityRegistrationSettingsScript.bucket.arnForObjects('*'),
                ]),
              },
            ),
          },
          Roles: [deploymentInstanceStack.resolve(deploymentInstanceRole.ref)],
        }));
      });

      test('DeploymentInstance downloads script', () => {
        // GIVEN
        const identityRegistrationSettingsScriptLocalPath = 'identityRegistrationSettingsScriptLocalPath';
        deploymentInstance.userData.addS3DownloadCommand.mockReturnValueOnce('deadlineClientLocalPath');
        deploymentInstance.userData.addS3DownloadCommand.mockReturnValueOnce(identityRegistrationSettingsScriptLocalPath);

        // WHEN
        createTarget();
        const identityRegistrationSettingsScript = getIdentityRegistrationSettingsScript();

        // THEN
        expect(deploymentInstance.userData.addS3DownloadCommand).toHaveBeenCalledWith<[S3DownloadOptions]>({
          bucket: identityRegistrationSettingsScript.bucket,
          bucketKey: identityRegistrationSettingsScript.s3ObjectKey,
          localFile: expect.stringMatching(/^\/home\/ec2-user\//),
        });
      });

      test('DeploymentInstance sets ownership and executable permissions for ec2-user', () => {
        // GIVEN
        const identityRegistrationSettingsScriptLocalPath = 'identityRegistrationSettingsScriptLocalPath';
        (
          deploymentInstance.userData.addS3DownloadCommand
            .mockReturnValueOnce('deadlineClientInstallerLocalPath')
            .mockReturnValueOnce('efsMountScriptLocalPath')
            .mockReturnValueOnce('directRepoConnectionConfigScriptLocalPath')
            .mockReturnValueOnce(identityRegistrationSettingsScriptLocalPath)
        );

        // WHEN
        createTarget();

        // THEN
        expect(deploymentInstance.userData.addCommands).toHaveBeenCalledWith<string[]>(
          `chmod +x ${identityRegistrationSettingsScriptLocalPath}`,
          `chown ec2-user:ec2-user ${identityRegistrationSettingsScriptLocalPath}`,
        );
      });
    });

    describe('.addSubnetIdentityRegistrationSetting(...)', () => {
      describe.each<[SecretsManagementRole]>([
        [SecretsManagementRole.SERVER],
        [SecretsManagementRole.CLIENT],
      ])('identityRole=%s', (identityRole) => {
        describe.each<[SecretsManagementRegistrationStatus]>([
          [SecretsManagementRegistrationStatus.PENDING],
          [SecretsManagementRegistrationStatus.REGISTERED],
          [SecretsManagementRegistrationStatus.REVOKED],
        ])('registrationStatus=%s', (registrationStatus) => {
          test('executes identity registration settings configuration script with proper arguments', () => {
            // GIVEN
            const identityRegistrationSettingsScriptLocalPath = 'identityRegistrationSettingsScriptLocalPath';
            (
              deploymentInstance.userData.addS3DownloadCommand
                .mockReturnValueOnce('deadlineClientInstallerLocalPath')
                .mockReturnValueOnce('efsMountScriptLocalPath')
                .mockReturnValueOnce('directRepoConnectionConfigScriptLocalPath')
                .mockReturnValueOnce(identityRegistrationSettingsScriptLocalPath)
            );
            const clientStack = new Stack(app, 'ClientStack');
            createTarget();

            // WHEN
            target.addSubnetIdentityRegistrationSetting({
              dependent: new Construct(clientStack, 'DeadlineClient'),
              registrationStatus,
              role: identityRole,
              vpc,
              vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
            });

            // THEN
            const resolvedCalls = deploymentInstance.userData.addCommands.mock.calls.map(call => {
              return deploymentInstanceStack.resolve(call);
            });
            const expectedCall = [{
              'Fn::Join': [
                '',
                [
                  // Command is run as "ec2-user" which has the database credentials stored
                  `sudo --login -u ec2-user ${identityRegistrationSettingsScriptLocalPath} `,
                  stack.resolve(Fn.join(
                    ' ',
                    [
                      '--region',
                      stack.region,
                      // The Deadline Secrets Management admin credentials secret ARN is passed
                      '--credentials',
                      `"${repository.secretsManagementSettings.credentials!.secretArn}"`,
                      // The Render Queue's ALB subnets are passed as --connection-subnet args
                      ...(vpc.selectSubnets({ subnetGroupName: RENDER_QUEUE_ALB_SUBNET_NAME })
                        .subnetIds.map(subnetID => `--connection-subnet "${subnetID}"`)
                      ),
                      // The Deadline Client's subnets, desired role, and registration status are passed as --source-subnet args
                      ...(vpc.selectSubnets({ subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME })
                        .subnetIds.map(subnetID => {
                          return `--source-subnet "${subnetID},${identityRole},${registrationStatus}"`;
                        })
                      ),
                    ],
                  )),
                ],
              ],
            }];
            expect(resolvedCalls).toContainEqual(expectedCall);
          });
        });
      });

      test('throws execption when using Administrator role', () => {
        // GIVEN
        createTarget();

        // WHEN
        function when() {
          target.addSubnetIdentityRegistrationSetting({
            dependent: new Construct(stack, 'Dependent'),
            registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
            role: SecretsManagementRole.ADMINISTRATOR,
            vpc,
            vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
          });
        }

        // THEN
        expect(when)
          .toThrowError('The Administrator role cannot be set using a Deadline identity registration setting');
      });

      test('throws when two rules for same source subnet with different roles', () => {
        // GIVEN
        const client1 = new Construct(stack, 'client1');
        const client2 = new Construct(stack, 'client2');
        const existingRole = SecretsManagementRole.SERVER;
        const newRole = SecretsManagementRole.CLIENT;
        createTarget();
        target.addSubnetIdentityRegistrationSetting({
          dependent: client1,
          registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
          role: existingRole,
          vpc,
          vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
        });

        // WHEN
        function when() {
          target.addSubnetIdentityRegistrationSetting({
            dependent: client2,
            registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
            role: newRole,
            vpc,
            vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
          });
        }

        // THEN
        expect(when)
          .toThrowError(`Subnet is already registered with role "${existingRole}" but another caller requested "${newRole}"`);
      });

      test('throws when two rules for same source subnet with different registration statuses', () => {
        // GIVEN
        const client1 = new Construct(stack, 'client1');
        const client2 = new Construct(stack, 'client2');
        const role = SecretsManagementRole.CLIENT;
        const existingStatus = SecretsManagementRegistrationStatus.REGISTERED;
        const newStatus = SecretsManagementRegistrationStatus.PENDING;
        createTarget();
        target.addSubnetIdentityRegistrationSetting({
          dependent: client1,
          registrationStatus: existingStatus,
          role,
          vpc,
          vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
        });

        // WHEN
        function when() {
          target.addSubnetIdentityRegistrationSetting({
            dependent: client2,
            registrationStatus: newStatus,
            role,
            vpc,
            vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
          });
        }

        // THEN
        expect(when)
          .toThrowError(`Subnet is already registered with registrationStatus "${existingStatus}" but another caller requested "${newStatus}"`);
      });

      test('de-duplicates subnets', () => {
        // GIVEN
        const identityRegistrationSettingsScriptLocalPath = 'identityRegistrationSettingsScriptLocalPath';
        (
          deploymentInstance.userData.addS3DownloadCommand
            .mockReturnValueOnce('deadlineClientInstallerLocalPath')
            .mockReturnValueOnce('efsMountScriptLocalPath')
            .mockReturnValueOnce('directRepoConnectionConfigScriptLocalPath')
            .mockReturnValueOnce(identityRegistrationSettingsScriptLocalPath)
        );
        const clientStack = new Stack(app, 'ClientStack');
        const client1 = new Construct(clientStack, 'client1');
        const client2 = new Construct(clientStack, 'client2');
        createTarget();
        const baseProps = {
          registrationStatus: SecretsManagementRegistrationStatus.REGISTERED,
          role: SecretsManagementRole.CLIENT,
          vpc,
          vpcSubnets: { subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME },
        };
        target.addSubnetIdentityRegistrationSetting({
          ...baseProps,
          dependent: client1,
        });

        // WHEN
        target.addSubnetIdentityRegistrationSetting({
          ...baseProps,
          dependent: client2,
        });

        // THEN
        const resolvedCalls = deploymentInstance.userData.addCommands.mock.calls.map(call => {
          return deploymentInstanceStack.resolve(call);
        });
        const expectedCall = [{
          'Fn::Join': [
            '',
            [
              // Command is run as "ec2-user" which has the database credentials stored
              `sudo --login -u ec2-user ${identityRegistrationSettingsScriptLocalPath} `,
              stack.resolve(Fn.join(
                ' ',
                [
                  '--region',
                  stack.region,
                  // The Deadline Secrets Management admin credentials secret ARN is passed
                  '--credentials',
                  `"${repository.secretsManagementSettings.credentials!.secretArn}"`,
                  // The Render Queue's ALB subnets are passed as --connection-subnet args
                  ...(vpc.selectSubnets({ subnetGroupName: RENDER_QUEUE_ALB_SUBNET_NAME })
                    .subnetIds.map(subnetID => `--connection-subnet "${subnetID}"`)
                  ),
                  // The Deadline Client's subnets, desired role, and registration status are passed as --source-subnet args
                  ...(vpc.selectSubnets({ subnetGroupName: DEADLINE_CLIENT_SUBNET_NAME })
                    .subnetIds.map(subnetID => {
                      return `--source-subnet "${subnetID},${baseProps.role},${baseProps.registrationStatus}"`;
                    })
                  ),
                ],
              )),
            ],
          ],
        }];
        expect(resolvedCalls).toContainEqual(expectedCall);
      });

      test('warns about dedicated subnets when render queue ALB and source subnets match', () => {
        // GIVEN
        createTarget();
        const dependent = new Construct(stack, 'Dependent');
        const registrationStatus = SecretsManagementRegistrationStatus.REGISTERED;
        const role = SecretsManagementRole.CLIENT;
        const vpcSubnets: SubnetSelection = {
          subnetGroupName: RENDER_QUEUE_ALB_SUBNET_NAME,
        };

        // WHEN
        target.addSubnetIdentityRegistrationSetting({
          dependent,
          registrationStatus,
          role,
          vpc,
          vpcSubnets,
        });

        expect(dependent.node.metadataEntry).toContainEqual(expect.objectContaining({
          type: 'aws:cdk:warning',
          data: `Deadline Secrets Management is enabled on the Repository and VPC subnets of the Render Queue match the subnets of ${dependent.node.path}. Using dedicated subnets is recommended. See https://github.com/aws/aws-rfdk/blobs/release/packages/aws-rfdk/lib/deadline/README.md#using-dedicated-subnets-for-deadline-components`,
        }));
      });
    });

    test('Repository with no admin credentials throws an error', () => {
      // GIVEN
      class RepositoryNoCredentials extends Repository {
        public readonly secretsManagementSettings: SecretsManagementProps;

        constructor(scope: Construct, id: string, props: RepositoryProps) {
          super(scope, id, props);
          this.secretsManagementSettings = {
            enabled: true,
            credentials: undefined,
          };
        }
      }
      repository = new RepositoryNoCredentials(dependencyStack, 'RepoNoCreds', {
        version,
        vpc,
      });

      // WHEN
      const when = createTarget;

      // THEN
      expect(when).toThrowError('Repository does not contain secrets management credentials');
    });
  });

  test('when Repository disables secrets management throws an exception', () => {
    // GIVEN
    repository = new Repository(stack, 'Repository', {
      version,
      vpc,
      secretsManagementSettings: {
        enabled: false,
      },
    });

    // WHEN
    function when() {
      new SecretsManagementIdentityRegistration(stack, 'IdentityRegistrationSettings', {
        deploymentInstance,
        renderQueueSubnets: vpc.selectSubnets({
          subnetGroupName: 'RenderQueueALB',
        }),
        repository,
        version,
      });
    }

    // THEN
    expect(when).toThrow();
  });
});
