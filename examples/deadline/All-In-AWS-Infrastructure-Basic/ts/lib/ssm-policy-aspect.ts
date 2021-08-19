import { AutoScalingGroup } from '@aws-cdk/aws-autoscaling';
import { Instance } from '@aws-cdk/aws-ec2';
import { ManagedPolicy } from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';

export class SSMInstancePolicyAspect implements cdk.IAspect {
  private static SSM_POLICY = ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore');
  public visit(node: cdk.IConstruct): void {
    if (node instanceof Instance || node instanceof AutoScalingGroup) {
      node.role.addManagedPolicy(SSMInstancePolicyAspect.SSM_POLICY);
    }
  }
}
