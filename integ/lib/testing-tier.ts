/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BastionHostLinux, InstanceType, Port, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { CfnOutput, Construct, Duration, Stack, StackProps } from '@aws-cdk/core';
import { X509CertificatePem } from 'aws-rfdk';
import { RenderQueue} from 'aws-rfdk/deadline';
import { IRenderFarmDb } from './storage-struct';

/**
 * Interface for configuring UserData to add to Bastion
 */
interface UserDataConfigProps {
  /**
   * Local path to the framework directory containing the testing script to be copied to the Bastion
   */
  readonly testingScriptPath: string;
}

/**
 * Base interface for Testing Tier
 */
export interface TestingTierProps extends StackProps {
  /**
   * The unique suffix given to all stacks in the testing app
   */
  readonly integStackTag: string;
}

/**
 * Base class for Testing Tier stacks
 */
export abstract class TestingTier extends Stack {
  /**
   * The Bastion instance used for communicating with the farm and executing test cases
   */
  public readonly testInstance: BastionHostLinux;

  /**
   * The version of Deadline used for installing DeadlineClient. Must be set by env variable before test execution.
   */
  private deadlineVersion: string = process.env.DEADLINE_VERSION!.toString();

  /**
   * Full path to locally staged Deadline assets. Must be set by env variable before test execution.
   */
  private stagePath: string = process.env.DEADLINE_STAGING_PATH!.toString();

  constructor(scope: Construct, id: string, props: TestingTierProps) {
    super(scope, id, props);

    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;

    // Vpc.fromLookup acquires vpc deployed to the _infrastructure stack
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    // Create an instance that can be used for testing; SSM commands are communicated to the
    // host instance to run test scripts installed during setup of the instance
    const testInstance: BastionHostLinux = new BastionHostLinux(this, 'Bastion', {
      vpc,
      instanceType: new InstanceType('t3.small'),
      subnetSelection: {
        subnetType: SubnetType.PRIVATE,
      },
    });
    this.testInstance = testInstance;

    // Output bastion id for use in tests
    new CfnOutput(this, 'bastionId', {
      value: testInstance.instanceId,
    });

  }

  /**
   * Grants the bastion permissions to read a resource's cert and creates a stack output for its secretARN.
   *
   * @param testSuiteId Test case to configure the cert for
   * @param cert Certificate for authenticating to the database/render queue used for this test case
   */
  public configureCert(testSuiteId: string, cert?: X509CertificatePem) {
    if(cert) {
      cert.cert.grantRead(this.testInstance);
      new CfnOutput(this, 'CertSecretARN' + testSuiteId, {
        value: cert.cert.secretArn,
      });
    };
  }

  /**
   * Allows the bastion to connect to the docDB/mongoDB instance and creates a stack output for the secretARN for the database
   *
   * @param testSuiteId Test case to configure the database for
   * @param database Database object to connect to the test Bastion
   */
  public configureDatabase(testSuiteId: string, database: IRenderFarmDb) {
    const db = database.db;
    const dbSecret = database.secret!;

    this.testInstance.connections.allowTo(db, Port.tcp(27017));
    dbSecret.grantRead(this.testInstance);

    new CfnOutput(this, 'DatabaseSecretARN' + testSuiteId, {
      value: dbSecret.secretArn,
    });
  }

  /**
   * Configures connections on the farm's render queue to allow the bastion access
   *
   * @param testSuiteId Test case to configure the render queue for
   * @param renderQueue Render queue object to connect to the test Bastion
   */
  public configureRenderQueue(testSuiteId: string, renderQueue: RenderQueue) {

    const port = renderQueue.endpoint.portAsString();

    // We are matching the name given to the render queue host in render-struct.ts
    const host = 'renderqueue';
    const suffix = '.local';
    const maxLength = 64 - host.length - '.'.length - suffix.length - 1;

    let address;
    switch(port) {
      case '8080':
        address = renderQueue.endpoint.hostname;
        break;
      case '4433':
        address = host + '.' + Stack.of(renderQueue).stackName.slice(0, maxLength) + suffix;
        break;
      default:
        break;
    }
    const renderQueueEndpoint = `${address}:${port}`;

    this.testInstance.connections.allowToDefaultPort(renderQueue);
    this.testInstance.connections.allowTo(renderQueue, Port.tcp(22));

    new CfnOutput(this, 'renderQueueEndpoint' + testSuiteId, {
      value: renderQueueEndpoint,
    });
  }

  /**
   * Adds userData commands to the test instance to install DeadlineClient
   */
  protected installDeadlineClient() {
    const clientInstaller = new Asset(this, 'ClientInstaller', {
      path: path.join(this.stagePath, 'bin', 'DeadlineClient-' + this.deadlineVersion + '-linux-x64-installer.run'),
    });
    clientInstaller.grantRead(this.testInstance);
    const installerPath: string = this.testInstance.instance.userData.addS3DownloadCommand({
      bucket: clientInstaller.bucket,
      bucketKey: clientInstaller.s3ObjectKey,
    });

    this.testInstance.instance.userData.addCommands(
      'cd ~ec2-user',
      `cp ${installerPath} ./deadline-client-installer.run`,
      'chmod +x *.run',
      'sudo yum install -y lsb',
      'sudo ./deadline-client-installer.run --mode unattended',
      `rm -f ${installerPath}`,
      'rm -f ./deadline-client-installer.run',
    );
  }

  /**
   * Configures assets to install on the bastion via userData
   *
   * @param props Options for configuring Bastion userData
   */
  public configureBastionUserData(props: UserDataConfigProps) {
    this.testInstance.instance.instance.cfnOptions.creationPolicy = {
      ...this.testInstance.instance.instance.cfnOptions.creationPolicy,
      resourceSignal: {
        timeout: Duration.minutes(5).toIsoString(),
        count: 1,
      },
    };

    const userDataCommands = [];

    userDataCommands.push(
      'set -xeou pipefail',
    );

    const instanceSetupScripts = new Asset(this, 'SetupScripts', {
      path: path.join(__dirname, '..', 'components', 'deadline', 'common', 'scripts', 'bastion', 'setup'),
    });
    instanceSetupScripts.grantRead(this.testInstance);
    const setupZipPath: string = this.testInstance.instance.userData.addS3DownloadCommand({
      bucket: instanceSetupScripts.bucket,
      bucketKey: instanceSetupScripts.s3ObjectKey,
    });

    userDataCommands.push(
      // Unzip the utility scripts to: ~ec2-user/setupScripts/
      'cd ~ec2-user',
      'mkdir -p setupScripts',
      'cd setupScripts',
      `unzip ${setupZipPath}`,
      `rm -f ${setupZipPath}`,
      'chmod +x *.sh',
      './install_jq.sh',
    );

    const instanceUtilScripts = new Asset(this, 'UtilScripts', {
      path: path.join(__dirname, '..', 'components', 'deadline', 'common', 'scripts', 'bastion', 'utils'),
    });
    instanceUtilScripts.grantRead(this.testInstance);
    const utilZipPath: string = this.testInstance.instance.userData.addS3DownloadCommand({
      bucket: instanceUtilScripts.bucket,
      bucketKey: instanceUtilScripts.s3ObjectKey,
    });

    userDataCommands.push(
      // Unzip the utility scripts to: ~ec2-user/utilScripts/
      'cd ~ec2-user',
      'mkdir -p utilScripts',
      'cd utilScripts',
      `unzip ${utilZipPath}`,
      `rm -f ${utilZipPath}`,
      'chmod +x *.sh',
    );

    const testingScripts = new Asset(this, 'TestingScripts', {
      path: props.testingScriptPath,
    });
    testingScripts.grantRead(this.testInstance);
    const testsZipPath: string = this.testInstance.instance.userData.addS3DownloadCommand({
      bucket: testingScripts.bucket,
      bucketKey: testingScripts.s3ObjectKey,
    });

    userDataCommands.push(
      // Unzip the testing scripts to: ~ec2-user/testScripts/
      'cd ~ec2-user',
      'mkdir -p testScripts',
      'cd testScripts',
      `unzip ${testsZipPath}`,
      `rm -f ${testsZipPath}`,
      'chmod +x *.sh',
    );

    userDataCommands.push(
      // Everything will be owned by root, by default (UserData runs as root)
      'cd ~ec2-user',
      'chown ec2-user.ec2-user -R *',
    );

    this.testInstance.instance.userData.addCommands( ...userDataCommands );
    this.testInstance.instance.userData.addSignalOnExitCommand( this.testInstance.instance );
  }
}
