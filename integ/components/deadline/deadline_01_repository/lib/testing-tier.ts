/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BastionHostLinux, InstanceType, Port, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { ILogGroup } from '@aws-cdk/aws-logs';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { CfnOutput, Construct, Duration, Stack, StackProps } from '@aws-cdk/core';
import { MongoDbInstaller, MongoDbSsplLicenseAcceptance, MongoDbVersion } from 'aws-rfdk';
import { StorageStruct } from '../../../../lib/storage-struct';

// Params object for TestingTier
export interface TestingTierProps extends StackProps {
  integStackTag: string;
  structs: Array<StorageStruct>;
}

// Class constructor
export class TestingTier extends Stack {
  constructor(scope: Construct, id: string, props: TestingTierProps) {
    super(scope, id, props);

    const userAcceptsSSPL = process.env.USER_ACCEPTS_SSPL_FOR_RFDK_TESTS!.toString();
    const userSsplAcceptance =
      userAcceptsSSPL === 'true' ? MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL : MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;

    // Vpc.fromLookup acquires vpc deployed to the _infrastructure stack
    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const vpc = Vpc.fromLookup(this, infrastructureStackName, { tags: { StackName: infrastructureStackName }}) as Vpc;

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
      var testSuiteId = 'DL' + (props.structs.indexOf(struct) + 1).toString();
      var repo = struct.repo;
      var database = struct.database.db;
      var dbSecret = struct.database.secret!;
      var cert = struct.database.cert;
      var efs = struct.efs!;
      var logGroup = struct.repo.node.findChild('RepositoryLogGroup') as ILogGroup;
      var logGroupName = logGroup.logGroupName;

      testInstance.connections.allowTo(database, Port.tcp(27017));
      testInstance.connections.allowToDefaultPort(efs);
      dbSecret.grantRead(testInstance);

      repo.fileSystem.mountToLinuxInstance(testInstance.instance, {
        location: '/mnt/efs/fs' + (props.structs.indexOf(struct) + 1).toString(),
      });

      if(cert) {
        cert.cert?.grantRead(testInstance);
        new CfnOutput(this, 'certSecretARN' + testSuiteId, {
          value: cert.cert.secretArn,
        });
      }

      new CfnOutput(this, 'secretARN' + testSuiteId, {
        value: dbSecret.secretArn,
      });

      new CfnOutput(this, 'logGroupName' + testSuiteId, {
        value: logGroupName,
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
      './install_jq.sh',
      // Unzip the testing scripts to: ~ec2-user/testScripts/
      'cd ~ec2-user',
      'mkdir testScripts',
      'cd testScripts',
      `unzip ${testsZipPath}`,
      'chmod +x *.sh',
      // Put the DocDB CA certificate in the testing directory.
      'wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem',
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
      `rm -f ${setupZipPath} ${testsZipPath} ${utilZipPath}`,
    );
    const mongodbInstaller = new MongoDbInstaller(this, {
      version: MongoDbVersion.COMMUNITY_3_6,
      userSsplAcceptance,
    });
    mongodbInstaller.installOnLinuxInstance(testInstance.instance);

    testInstance.instance.userData.addSignalOnExitCommand( testInstance.instance );
  }
}
