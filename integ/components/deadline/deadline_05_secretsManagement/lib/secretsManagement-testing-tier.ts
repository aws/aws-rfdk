/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { CfnOutput } from 'aws-cdk-lib';
import {
  IVpc,
} from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-rfdk/deadline';
import { Construct } from 'constructs';
import { RenderStruct } from '../../../../lib/render-struct';
import { StorageStruct } from '../../../../lib/storage-struct';
import {
  TestingTier,
  TestingTierProps,
} from '../../../../lib/testing-tier';
import { NetworkTier } from '../../../_infrastructure/lib/network-tier';

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
    this.configureRepoConnection(testSuiteId, props.storageStruct.repo);
    this.configureDatabase(testSuiteId, props.storageStruct.database);
    this.testInstance.connections.allowToDefaultPort(props.storageStruct.efs);
    this.configureCert(testSuiteId, props.storageStruct.database.cert, 'Database');
    this.configureRenderQueue(testSuiteId, props.renderStruct.renderQueue);
    this.configureCert(testSuiteId, props.renderStruct.cert, 'RenderQueue');

    this.configureBastionUserData({
      testingScriptPath: path.join(__dirname, '../scripts/bastion/testing'),
    });

    // Generate CfnOutputs for the subnets of components that should be auto-registered as Clients
    this.generateComponentCfnOutputs(testSuiteId, this.vpc);
  }

  /**
   * Mounts the Deadline repository's file system to the bastion and outputs the ARN of the
   * Secret containing Deadline Secrets Management admin credentials.
   *
   * @param testSuiteId Test case to configure the repository for
   * @param repo Repository object to connect to the test Bastion
   */
  private configureRepoConnection(testSuiteId: string, repo: Repository) {
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

  /**
   * Generates CfnOutputs for the Render Queue ALB subnets and Deadline client subnets.
   * @param testSuiteId The ID of the test suite.
   * @param vpc The infrastructure VPC containing the subnets the components are deployed into.
   */
  private generateComponentCfnOutputs(testSuiteId: string, vpc: IVpc): void {
    const { renderQueueAlb, testRunner, ...subnetsToCheck } = NetworkTier.subnetConfig;

    // Create outputs for Render Queue ALB
    const renderQueueAlbSubnets = vpc.selectSubnets({ subnetGroupName: renderQueueAlb.name });
    new CfnOutput(this, `renderQueueAlbSubnetIds${testSuiteId}`, {
      value: JSON.stringify(renderQueueAlbSubnets.subnetIds),
    });
    new CfnOutput(this, `renderQueueAlbSubnetCidrBlocks${testSuiteId}`, {
      value: JSON.stringify(renderQueueAlbSubnets.subnets.map(subnet => subnet.ipv4CidrBlock)),
    });

    // Create outputs for clients connecting to the Render Queue
    Object.entries(subnetsToCheck).forEach(kvp => {
      let [componentName, subnetConfig] = kvp;
      const subnets = vpc.selectSubnets({ subnetGroupName: subnetConfig.name });
      new CfnOutput(this, `${componentName}SubnetIds${testSuiteId}`, {
        value: JSON.stringify(subnets.subnetIds),
      });
      new CfnOutput(this, `${componentName}SubnetCidrBlocks${testSuiteId}`, {
        value: JSON.stringify(subnets.subnets.map(subnet => subnet.ipv4CidrBlock)),
      });
    });
  }
}
