/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Construct } from '@aws-cdk/core';
import { RenderStruct } from '../../../../lib/render-struct';
import { TestingTier, TestingTierProps } from '../../../../lib/testing-tier';

/**
 * Interface for RenderQueueTestingTier properties
 */
export interface RenderQueueTestingTierProps extends TestingTierProps {
  /**
   * Array of RenderStructs representing different test cases
   */
  readonly structs:Array<RenderStruct>;
}

/**
 * Testing Tier for the Deadline RenderQueue integration test
 *
 * Creates a test bastion and configures it to connect to one or more Deadline RenderQueue constructs for testing
 *
 * Resources Deployed
 * ------------------------
 * - A BastionLinuxHost instance
 *
 * Security Considerations
 * ------------------------
 * - The bastion instance created by this test is configured to access farm resources on their default ports
 *   Test scripts stored on the bastion are used to fetch files stored on the repository and submit Deadline commands/jobs.
 *   At execution the tests retrieve the value of secrets for the authentication cert.
 */
export class RenderQueueTestingTier extends TestingTier {
  constructor(scope:Construct, id:string, props:RenderQueueTestingTierProps) {
    super(scope, id, props);

    const structs = props.structs;
    structs.forEach( renderStruct => {

      const testSuiteId = 'RQ' + (structs.indexOf(renderStruct) + 1).toString();

      const renderQueue = renderStruct.renderQueue;
      this.configureRenderQueue(testSuiteId, renderQueue);

      const cert = renderStruct.cert;
      this.configureCert(testSuiteId, cert);

    });

    this.configureBastionUserData({
      testingScriptPath: path.join(__dirname, '../scripts/bastion/testing'),
    });
    this.installDeadlineClient();
  }
}
