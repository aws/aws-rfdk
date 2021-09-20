/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { SelectedSubnets } from '@aws-cdk/aws-ec2';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import {
  Construct,
  Lazy,
  Stack,
  Fn,
} from '@aws-cdk/core';

import {
  IRepository,
  IVersion,
  SecretsManagementRole,
  SecretsManagementRegistrationStatus,
  SubnetIdentityRegistrationSettingsProps,
} from '.';
import {
  ScriptAsset,
} from '../../core';
import { DeploymentInstance } from '../../core/lib/deployment-instance';

interface RegistrationSettingStack {
  /**
   * The Deadline Secrets Management registration status to be applied to the Deadline Client identities that connect
   * from the specified VPC subnets.
   *
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#registration-status
   */
  readonly registrationStatus: SecretsManagementRegistrationStatus;

  /**
   * The role to assign to be assigned to the Deadline Client identities that connect from the specified VPC subnets.
   *
   * See https://docs.thinkboxsoftware.com/products/deadline/10.1/1_User%20Manual/manual/secrets-management/deadline-secrets-management.html#assigned-roles
   */
  readonly role: SecretsManagementRole;

  /**
   * The stack of the subnet
   */
  readonly stack: Stack;
}

/**
 * Properties for configuring a Deadline Repository to auto-register Deadline Client identities that connect
 */
export interface SecretsManagementIdentityRegistrationProps {
  /**
   * The deployment instance to use for registration
   */
  readonly deploymentInstance: DeploymentInstance;

  /**
   * The Render Queue that will be applying the identity registration settings
   */
  readonly renderQueueSubnets: SelectedSubnets;

  /**
   * The Deadline Repository to configure auto-registration on
   */
  readonly repository: IRepository;

  /**
   * The version of the Deadline Client to use for performing the identity registration settings commands
   */
  readonly version: IVersion;
}

export class SecretsManagementIdentityRegistration extends Construct {
  private readonly adminCredentials: ISecret;

  private readonly deploymentInstance: DeploymentInstance;

  private readonly subnetRegistrations: Map<string, RegistrationSettingStack>;

  constructor(scope: Construct, id: string, props: SecretsManagementIdentityRegistrationProps) {
    super(scope, id);

    this.subnetRegistrations = new Map<string, RegistrationSettingStack>();

    if (!props.repository.secretsManagementSettings.enabled) {
      throw new Error('Secrets management is not enabled on repository');
    }
    /* istanbul ignore next */
    if (!props.repository.secretsManagementSettings.credentials) {
      throw new Error('Repository does not contain secrets management credentials');
    }
    this.adminCredentials = props.repository.secretsManagementSettings.credentials;
    this.deploymentInstance = props.deploymentInstance;

    // Download and install the Deadline Client
    this.installDeadlineClient(props);

    // Configure the Deadline Client to direct-connect to the repository
    props.repository.configureClientInstance({
      host: props.deploymentInstance,
      mountPoint: '/mnt/repository',
    });

    // Install python dependencies
    this.preparePythonEnvironment(props);
    const localScriptFile = this.preparePythonScript(props);
    this.runPythonScript(props, localScriptFile);

    props.deploymentInstance.addExecutionDependency(props.repository);
  }

  public addSubnetIdentityRegistrationSetting(addSubnetProps: SubnetIdentityRegistrationSettingsProps) {
    if (addSubnetProps.role === SecretsManagementRole.ADMINISTRATOR) {
      throw new Error('The Administrator role cannot be set using a Deadline identity registration setting');
    }
    const { vpc, vpcSubnets } = addSubnetProps;
    const selectedSubnets = vpc.selectSubnets(vpcSubnets);
    selectedSubnets.subnets.forEach(subnet => {
      const observedSubnet = this.subnetRegistrations.get(subnet.subnetId);
      if (observedSubnet) {
        if (observedSubnet.registrationStatus !== addSubnetProps.registrationStatus) {
          throw new Error(`Subnet is already registered with registrationStatus "${observedSubnet.registrationStatus}" but another caller requested "${addSubnetProps.registrationStatus}"`);
        } else if (observedSubnet.role !== addSubnetProps.role) {
          throw new Error(`Subnet is already registered with role "${observedSubnet.role}" but another caller requested "${addSubnetProps.role}"`);
        }
      } else {
        this.subnetRegistrations.set(subnet.subnetId, {
          registrationStatus: addSubnetProps.registrationStatus,
          role: addSubnetProps.role,
          stack: Stack.of(subnet),
        });
      }
    });
    addSubnetProps.dependent.node.addDependency(this.deploymentInstance);
  }

  private runPythonScript(props: SecretsManagementIdentityRegistrationProps, localScriptFile: string) {
    // The command-line arguments to be passed to the script that configures the Deadline identity registration
    // settings
    const scriptArgs = Lazy.list({
      produce: () => {
        return ([] as string[]).concat(
          [
            // Region
            '--region',
            Stack.of(this).region,
            // Admin credentials
            '--credentials',
            `"${this.adminCredentials.secretArn}"`,
          ],
          // Subnets of the load balancer
          (
            props.renderQueueSubnets
              .subnetIds
              .map(subnetID => `--connection-subnet "${subnetID}"`)
          ),
          Array.from(this.subnetRegistrations.entries())
            // Each setting becomes a comma (,) separated string of fields
            //   <SUBNET_ID>,<ROLE>,<REGISTRATIONSTATUS>
            .map(subnetRegistrationEntry => {
              const [subnetID, registrationSettingEffect] = subnetRegistrationEntry;
              return [
                subnetID,
                registrationSettingEffect.role.toString(),
                (registrationSettingEffect.registrationStatus).toString(),
              ].join(',');
            })
            // quote
            .map(joinedSubnetArgValue => `--source-subnet "${joinedSubnetArgValue}"`),
        );
      },
    });

    // We can't use ScriptAsset.executeOn(...) because we need to run as "ec2-user".
    // This is because Repository.configureClientInstance(...) used above will store the credentials
    // in a per-user credential store that is only available to "ec2-user".
    props.deploymentInstance.userData.addCommands(
      `sudo --login -u ec2-user ${localScriptFile} ` + Fn.join(
        ' ',
        scriptArgs,
      ),
    );
  }

  private preparePythonScript(props: SecretsManagementIdentityRegistrationProps) {
    const script = new ScriptAsset(this, 'ConfigureIdentityRegistrationSettingScript', {
      path: path.join(
        __dirname,
        '..',
        'scripts',
        'python',
        'configure_identity_registration_settings.py',
      ),
    });

    // Grant access to ec2:DescribeSubnets. Subnet IPv4 CIDR ranges are not exposed through
    // CloudFormation attributes. Instead, we must query them using the EC2 API on the deployment instance
    props.deploymentInstance.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
      actions: ['ec2:DescribeSubnets'],
      // ec2:DescribeSubnets does not support resource level permissions. See
      // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonec2.html
      resources: ['*'],
    }));

    this.adminCredentials.grantRead(props.deploymentInstance);

    script.grantRead(props.deploymentInstance);
    const localScriptFile = props.deploymentInstance.userData.addS3DownloadCommand({
      bucket: script.bucket,
      bucketKey: script.s3ObjectKey,
      localFile: '/home/ec2-user/configure_identity_registration_settings.py',
    });
    props.deploymentInstance.userData.addCommands(
      `chmod +x ${localScriptFile}`,
      `chown ec2-user:ec2-user ${localScriptFile}`,
    );
    return localScriptFile;
  }

  private installDeadlineClient(props: SecretsManagementIdentityRegistrationProps) {
    props.version.linuxInstallers.client.s3Bucket.grantRead(
      props.deploymentInstance,
      props.version.linuxInstallers.client.objectKey,
    );
    const clientInstallerPath = props.deploymentInstance.userData.addS3DownloadCommand({
      bucket: props.version.linuxInstallers.client.s3Bucket,
      bucketKey: props.version.linuxInstallers.client.objectKey,
    });
    props.deploymentInstance.userData.addCommands('set -x');
    props.deploymentInstance.userData.addCommands(`chmod +x "${clientInstallerPath}"`);
    props.deploymentInstance.userData.addCommands(
      [
        // This is required b/c USER and HOME environment variables are not defined when running
        // user-data
        'sudo', '--login',

        // Run the Deadline Client installer
        `"${clientInstallerPath}"`,
        '--mode', 'unattended',
        '--connectiontype', 'Remote',
        '--proxyrootdir', '127.0.0.1:8080',
        '--noguimode', 'true',
        '--slavestartup', 'false',
        '--launcherdaemon', 'false',
        '--restartstalled', 'true',
        '--autoupdateoverride', 'False',
      ].join(' '),
    );
  }

  private preparePythonEnvironment(props: SecretsManagementIdentityRegistrationProps) {
    // The script must run as ec2-user because Repository.configureClientInstance(...) used above will store the
    // credentials in a per-user credential store that is only available to "ec2-user".
    props.deploymentInstance.userData.addCommands(
      'sudo -u ec2-user python3 -m pip install --user boto3',
    );
  }
}
