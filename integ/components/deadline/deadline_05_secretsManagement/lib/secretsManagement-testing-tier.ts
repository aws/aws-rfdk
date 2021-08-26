/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { Repository } from 'aws-rfdk/deadline';
import { RenderStruct } from '../../../../lib/render-struct';
import { StorageStruct } from '../../../../lib/storage-struct';
import { TestingTier, TestingTierProps } from '../../../../lib/testing-tier';

/**
 * Properties for SecretsManagementTestingTier
 */
export interface SecretsManagementTestingTierProps extends TestingTierProps {
  readonly renderStruct: RenderStruct;
  readonly storageStruct: StorageStruct;
}

/**
 * Testing Tier for the Deadline Secrets Management integration test
 *
 * Creates a test bastion and configures it to connect to a Deadline Repository with Secrets Management enabled
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
export class SecretsManagementTestingTier extends TestingTier {
  constructor(scope: Construct, id: string, props: SecretsManagementTestingTierProps) {
    super(scope, id, props);

    const testSuiteId = 'SM1';
    this.configureRepo(testSuiteId, props.storageStruct.repo);
    this.configureDatabase(testSuiteId, props.storageStruct.database);
    this.testInstance.connections.allowToDefaultPort(props.storageStruct.efs);
    this.configureCert(testSuiteId, props.storageStruct.database.cert);
    this.configureRenderQueue(testSuiteId, props.renderStruct.renderQueue);
    this.configureCert(testSuiteId, props.renderStruct.cert);

    this.configureBastionUserData({
      testingScriptPath: path.join(__dirname, '../scripts/bastion/testing'),
    });
  }

  /**
   * @inheritdoc
   */
  protected installDeadlineClient(): void {
    super.installDeadlineClient();
    this.testInstance.instance.addUserData('export DEADLINE_PATH=/opt/Thinkbox/Deadline10/bin');
  }

  /**
   * Mounts the Deadline repository's file system to the bastion and outputs the name of its log group
   *
   * @param testSuiteId Test case to configure the repository for
   * @param repo Repository object to connect to the test Bastion
   */
  private configureRepo(testSuiteId: string, repo: Repository) {
    this.installDeadlineClient();
    repo.configureClientInstance({
      host: this.testInstance.instance,
      mountPoint: '/mnt/efs/fs' + testSuiteId.toLowerCase(),
    });

    if (repo.secretsManagementSettings.enabled) {
      repo.secretsManagementSettings.credentials!.grantRead(this.testInstance);
      new CfnOutput(this, 'deadlineSecretsManagementCredentials' + testSuiteId, {
        value: repo.secretsManagementSettings.credentials!.secretArn,
      });
    }
  }
}
