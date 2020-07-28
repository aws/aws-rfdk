/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { Environment } from '@aws-cdk/core';
import { Stage } from "aws-rfdk/deadline";

/**
 * Interface for the configuration of the Kitchen Sink render farm application
 */
export interface AppConfig {
  /**
   * The domain name to use for the render farm.
   *
   * A corresponding Route53 private hosted zone will be created for this domain.
   */
  readonly domainName: string;

  /**
   * The hostname of render queue.
   *
   * A DNS A record will be created with this name in the private hosted zone along with TLS certificates, private keys,
   * and passphrases in Secrets Manager.
   */
  readonly renderQueueHostname: string;

  /**
   * The deployment environment
   */
  readonly env: Environment;

  /**
   * The stage containing the Deadline installer and Docker image recipes.
   */
  readonly stage: Stage;
}

const DOMAIN_NAME = 'renderfarm.local';
const RENDER_QUEUE_HOSTNAME = 'renderqueue';

/**
 * The application configuration of the Kitchen Sink app
 */
export const config: AppConfig = {
  domainName: DOMAIN_NAME,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  renderQueueHostname: RENDER_QUEUE_HOSTNAME,
  stage: Stage.fromDirectory(path.join(__dirname, "..", "stage")),
};