/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BastionHostLinux, InstanceType, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { CfnOutput, Construct, Duration, Stack, StackProps } from '@aws-cdk/core';
import { RenderStruct } from '../../../../lib/render-struct';

// Params object for TestingTier
export interface TestingTierProps extends StackProps {
  integStackTag: string;
  structs: Array<RenderStruct>;
}

// Class constructor
export class TestingTier extends Stack {
  constructor(scope: Construct, id: string, props: TestingTierProps) {
    super(scope, id, props);

    // Collect environment variables
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const deadlineVersion = process.env.DEADLINE_VERSION!.toString();
    const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();

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

    new CfnOutput(this, 'bastionId', {
      value: testInstance.instanceId,
    });

    new CfnOutput(this, 'testCases', {
      value: props.structs.length.toString(),
    });

    props.structs.forEach( struct => {
      var testSuiteId = 'RQ' + (props.structs.indexOf(struct) + 1).toString();
      var renderQueue = struct.renderQueue;
      var cert = struct.cert;
      var port = renderQueue.endpoint.portAsString();
      var address;
      switch(port) {
        case '8080':
          address = renderQueue.endpoint.hostname;
          break;
        case '4433':
          address = 'renderqueue.renderfarm.local';
          break;
        default:
          break;
      }
      var renderQueueEndpoint = `${address}:${port}`;

      if(cert) {
        cert?.cert.grantRead(testInstance);
        new CfnOutput(this, 'certSecretARN' + testSuiteId, {
          value: cert.cert.secretArn,
        });
      }

      new CfnOutput(this, 'renderQueueEndpoint' + testSuiteId, {
        value: renderQueueEndpoint,
      });

    });

    testInstance.instance.instance.cfnOptions.creationPolicy = {
      ...testInstance.instance.instance.cfnOptions.creationPolicy,
      resourceSignal: {
        timeout: Duration.minutes(5).toISOString(),
        count: 1,
      },
    };

    // Set up user data to install scripts and other functionality on the Bastion instance
    // Deadline client is necessary on the bastion instance that runs the tests, so this grabs the installer set up in the provided staging folder to do it
    const clientInstaller = new Asset(this, 'ClientInstaller', {
      path: path.join(stagePath, 'bin', 'DeadlineClient-' + deadlineVersion + '-linux-x64-installer.run'),
    });
    clientInstaller.grantRead(testInstance);

    const instanceSetupScripts = new Asset(this, 'SetupScripts', {
      path: path.join(__dirname, '..', '..', 'common', 'scripts', 'bastion', 'setup'),
    });
    instanceSetupScripts.grantRead(testInstance);

    const instanceUtilScripts = new Asset(this, 'UtilScripts', {
      path: path.join(__dirname, '..', '..', 'common', 'scripts', 'bastion', 'utils'),
    });
    instanceUtilScripts.grantRead(testInstance);

    const testingScripts = new Asset(this, 'TestingScripts', {
      path: path.join(__dirname, '..', 'scripts', 'bastion', 'testing'),
    });
    testingScripts.grantRead(testInstance);

    const installerPath: string = testInstance.instance.userData.addS3DownloadCommand({
      bucket: clientInstaller.bucket,
      bucketKey: clientInstaller.s3ObjectKey,
    });
    const setupZipPath: string = testInstance.instance.userData.addS3DownloadCommand({
      bucket: instanceSetupScripts.bucket,
      bucketKey: instanceSetupScripts.s3ObjectKey,
    });
    const utilZipPath: string = testInstance.instance.userData.addS3DownloadCommand({
      bucket: instanceUtilScripts.bucket,
      bucketKey: instanceUtilScripts.s3ObjectKey,
    });
    const testsZipPath: string = testInstance.instance.userData.addS3DownloadCommand({
      bucket: testingScripts.bucket,
      bucketKey: testingScripts.s3ObjectKey,
    });

    testInstance.instance.userData.addCommands(
      'set -xeou pipefail',
      'TMPDIR=$(mktemp -d)',
      'cd "${TMPDIR}"',
      // Unzip & run the instance setup scripts
      `unzip ${setupZipPath}`,
      'chmod +x *.sh',
      // Copy over the Deadlient client installer and install it
      `cp ${installerPath} ./deadline-client-installer.run`,
      'chmod +x *.run',
      './install_deadline_client.sh',
      './install_jq.sh',
      // Unzip the testing scripts to: ~ec2-user/testScripts/
      'cd ~ec2-user',
      'mkdir testScripts',
      'cd testScripts',
      `unzip ${testsZipPath}`,
      'chmod +x *.sh',
      // Unzip the utility scripts to: ~ec2-user/utilScripts/
      'cd ~ec2-user',
      'mkdir utilScripts',
      'cd utilScripts',
      `unzip ${utilZipPath}`,
      'chmod +x *.sh',
      // Everything will be owned by root, by default (UserData runs as root)
      'chown ec2-user.ec2-user -R *',
      // Cleanup
      'rm -rf "${TMPDIR}"',
      `rm -f ${setupZipPath} ${testsZipPath} ${installerPath} ${utilZipPath}`,
    );
    testInstance.instance.userData.addSignalOnExitCommand( testInstance.instance );
  }
}
