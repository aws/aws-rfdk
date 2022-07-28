/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from 'aws-cdk-lib';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { Instance } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { IConstruct } from 'constructs';

export class SSMInstancePolicyAspect implements cdk.IAspect {
  private static readonly SSM_POLICY = ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore');
  public visit(node: IConstruct): void {
    if (node instanceof Instance || node instanceof AutoScalingGroup) {
      node.role.addManagedPolicy(SSMInstancePolicyAspect.SSM_POLICY);
    }
  }
}
