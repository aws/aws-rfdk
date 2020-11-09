/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Port } from '@aws-cdk/aws-ec2';
import { Construct } from '@aws-cdk/core';
import { IWorkerFleet } from 'aws-rfdk/deadline';
import { TestingTier, TestingTierProps } from '../../../../lib/testing-tier';
import { WorkerStruct } from '../../../../lib/worker-struct';

/**
 * Interface for WorkerFleetTestingTier properties
 */
export interface WorkerFleetTestingTierProps extends TestingTierProps {
  /**
   * Array of WorkerStructs representing different test cases
   */
  readonly structs: Array<WorkerStruct>;
}

/**
 * Testing Tier for the Deadline WorkerFleet HTTPS integration test
 *
 * Creates a test bastion and configures it to connect to one or more Deadline WorkerInstanceFleet constructs for testing.
 *
 * Resources Deployed
 * ------------------------
 * - A BastionLinuxHost instance
 *
 * Security Considerations
 * ------------------------
 * - The bastion instance created by this test is configured to access farm resources on their default ports
 *   Test scripts stored on the bastion are used to submit Deadline jobs to farm workers and request information about the workers.
 *   At execution the tests retrieve the value of secrets for the authentication cert.
 */
export class WorkerFleetTestingTier extends TestingTier {
  constructor(scope: Construct, id: string, props: WorkerFleetTestingTierProps) {
    super(scope, id, props);

    const structs = props.structs;
    structs.forEach( workerStruct => {

      const testSuiteId = 'WS' + (structs.indexOf(workerStruct) + 1).toString();

      const renderQueue = workerStruct.renderQueue;
      this.configureRenderQueue(testSuiteId, renderQueue);

      const cert = workerStruct.cert;
      this.configureCert(testSuiteId, cert);

      const workerFleet = workerStruct.workerFleet;
      this.configureWorkerFleet(workerFleet);
    });

    this.configureBastionUserData({
      testingScriptPath: path.join(__dirname, '../scripts/bastion/testing'),
    });
    this.installDeadlineClient();
  }

  /**
   * Configures each worker to allow access from the bastion
   *
   * @param workerFleet Array of worker instances to connect to the test Bastion
   */
  public configureWorkerFleet(workerFleet: Array<IWorkerFleet>) {
    workerFleet.forEach( worker => {
      this.testInstance.connections.allowTo(worker, Port.tcp(22));
    });
  }

}
