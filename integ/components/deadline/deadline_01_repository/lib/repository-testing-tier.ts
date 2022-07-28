/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { CfnOutput } from 'aws-cdk-lib';
import { ILogGroup } from 'aws-cdk-lib/aws-logs';
import { MongoDbInstaller, MongoDbSsplLicenseAcceptance, MongoDbVersion } from 'aws-rfdk';
import { Repository } from 'aws-rfdk/deadline';
import { Construct } from 'constructs';
import { StorageStruct } from '../../../../lib/storage-struct';
import { TestingTier, TestingTierProps } from '../../../../lib/testing-tier';

/**
 * Interface for RepositoryTestingTier properties
 */
export interface RepositoryTestingTierProps extends TestingTierProps {
  /**
   * Array of StorageStructs representing different test cases
   */
  readonly structs: Array<StorageStruct>;
}

/**
 * Testing Tier for the Deadline Repository integration test
 *
 * Creates a test bastion and configures it to connect to one or more Deadline Repository constructs for testing
 *
 * Resources Deployed
 * ------------------------
 * - A BastionLinuxHost instance
 *
 * Security Considerations
 * ------------------------
 * - The bastion instance created by this test is configured to access farm resources on their default ports
 *   Test scripts stored on the bastion are used to read/write to the repository database and the file system.
 *   At execution the tests retrieve the value of secrets for the database password and authentication cert.
 */
export class RepositoryTestingTier extends TestingTier {
  constructor(scope: Construct, id: string, props: RepositoryTestingTierProps) {
    super(scope, id, props);

    const structs = props.structs;
    structs.forEach( storageStruct => {

      const testSuiteId = 'DL' + (structs.indexOf(storageStruct) + 1).toString();

      const repo = storageStruct.repo;
      this.configureRepo(testSuiteId, repo);

      const database = storageStruct.database;
      this.configureDatabase(testSuiteId, database);

      const efs = storageStruct.efs;
      this.testInstance.connections.allowToDefaultPort(efs);

      const cert = storageStruct.database.cert;
      this.configureCert(testSuiteId, cert);
    });

    this.configureBastionUserData({
      testingScriptPath: path.join(__dirname, '../scripts/bastion/testing'),
    });
    this.fetchDocdbCert();
    this.installMongodb();

  }

  /**
   * Mounts the Deadline repository's file system to the bastion and outputs the name of its log group
   *
   * @param testSuiteId Test case to configure the repository for
   * @param repo Repository object to connect to the test Bastion
   */
  private configureRepo(testSuiteId: string, repo: Repository) {

    repo.fileSystem.mountToLinuxInstance(this.testInstance.instance, {
      location: '/mnt/efs/fs' + testSuiteId.toLowerCase(),
    });

    const logGroup = repo.node.tryFindChild('RepositoryLogGroup') as ILogGroup;
    if (logGroup) {
      const logGroupName = logGroup.logGroupName;
      new CfnOutput(this, 'logGroupName' + testSuiteId, {
        value: logGroupName,
      });
    }
    else {
      throw new Error('Error: Child "RepositoryLogGroup" not found on provided Repository object');
    }
  }

  /**
   * Installs MongoDB on the test instance
   */
  protected installMongodb() {
    const userAcceptsSSPL = process.env.USER_ACCEPTS_SSPL_FOR_RFDK_TESTS;
    if (userAcceptsSSPL) {
      const userSsplAcceptance =
        userAcceptsSSPL.toString() === 'true' ? MongoDbSsplLicenseAcceptance.USER_ACCEPTS_SSPL : MongoDbSsplLicenseAcceptance.USER_REJECTS_SSPL;
      const mongodbInstaller = new MongoDbInstaller(this, {
        version: MongoDbVersion.COMMUNITY_3_6,
        userSsplAcceptance,
      });
      mongodbInstaller.installOnLinuxInstance(this.testInstance.instance);
    }
  }

  /**
   * Adds user data to the bastion instance that fetches the shared DocDB cert bundle for authenticating to the database
   */
  protected fetchDocdbCert() {
    this.testInstance.instance.userData.addCommands(
      'cd ~ec2-user',
      'mkdir -p testScripts',
      'cd testScripts',
      'wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem',
    );
  }
}
