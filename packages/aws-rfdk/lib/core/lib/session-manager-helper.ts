/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IGrantable,
  PolicyStatement,
} from '@aws-cdk/aws-iam';

/**
 * This is a helper class meant to make it easier to use the AWS Systems Manager Session Manager
 * with any EC2 Instances or AutoScalingGroups. Once enabled, the Session Manager can be used to
 * connect to an EC2 Instance through the AWS Console and open a shell session in the browser.
 *
 * Note that in order for the Session Manager to work, you will need an AMI that has the SSM-Agent
 * installed and set to run at startup. The Amazon Linux 2 and Amazon provided Windows Server AMI's
 * have this configured by default.
 *
 * More details about the AWS Systems Manager Session Manager can be found here:
 * https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
 */
export class SessionManagerHelper {
  /**
   * Grants the permissions required to enable Session Manager for the provided IGrantable.
   */
  public static grantPermissionsTo(grantable: IGrantable): void {
    grantable.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel',
        'ssm:UpdateInstanceInformation',
      ],
      resources: ['*'],
    }));
  }
}
