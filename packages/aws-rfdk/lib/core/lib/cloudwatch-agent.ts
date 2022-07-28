/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { Stack } from 'aws-cdk-lib';
import { IGrantable } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { IScriptHost, ScriptAsset } from './script-assets';

/**
 *  Properties for creating the resources needed for CloudWatch Agent configuration.
 */
export interface CloudWatchAgentProps {
  /**
   * CloudWatch agent configuration string in json format.
   *
   * @see - https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html
   */
  readonly cloudWatchConfig: string;

  /**
   * The host instance/ASG/fleet with a CloudWatch Agent to be configured.
   */
  readonly host: IScriptHost;

  /**
   * Whether or not we should attempt to install the CloudWatch agent
   *
   * @default true
   */
  readonly shouldInstallAgent?: boolean;
}

/**
 * This construct is a thin wrapper that provides the ability to install and configure the CloudWatchAgent
 * ( https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html )
 * on one or more EC2 instances during instance startup.
 *
 * It accomplishes this by downloading and executing the configuration script on the instance.
 * The script will download the CloudWatch Agent installer,
 * optionally verify the installer, and finally install the CloudWatch Agent.
 * The installer is downloaded via the Amazon S3 API, thus, this construct can be used
 * on instances that have no access to the internet as long as the VPC contains
 * an VPC Gateway Endpoint for S3 ( https://docs.aws.amazon.com/vpc/latest/userguide/vpc-endpoints-s3.html ).
 *
 * {@link CloudWatchAgent.SKIP_CWAGENT_VALIDATION_CTX_VAR} - Context variable to skip validation
 * of the downloaded CloudWatch Agent installer if set to 'TRUE'.
 * WARNING: Only use this if your deployments are failing due to a validation failure,
 * but you have verified that the failure is benign.
 *
 * Resources Deployed
 * ------------------------
 * - String SSM Parameter in Systems Manager Parameter Store to store the cloudwatch agent configuration;
 * - A script Asset which is uploaded to S3 bucket.
 *
 * Security Considerations
 * ------------------------
 * - Using this construct on an instance will result in that instance dynamically downloading and running scripts
 *   from your CDK bootstrap bucket when that instance is launched. You must limit write access to your CDK bootstrap
 *   bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly recommend that
 *   you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS CloudTrail on your
 *   account to assist in post-incident analysis of compromised production environments.
 */
export class CloudWatchAgent extends Construct {

  /**
   * The context variable to indicate that CloudWatch agent installer validation should be skipped.
   */
  public static readonly SKIP_CWAGENT_VALIDATION_CTX_VAR = 'RFDK_SKIP_CWAGENT_VALIDATION';

  /**
   * The flag for configureCloudWatchAgent script to skip CloudWatch agent installer validation.
   */
  private static readonly SKIP_CWAGENT_VALIDATION_FLAG = '-s';

  /**
   * The flag for configureCloudWatchAgent script to skip CloudWatch agent installer validation.
   */
  private static readonly INSTALL_CWAGENT_FLAG = '-i';

  /**
   * An S3 script asset that configures the CloudWatch agent.
   */
  private readonly configurationScript: ScriptAsset;

  /**
   * An AWS String Parameter created for storing the cloudwatch agent configuration.
   */
  private readonly ssmParameterForConfig: StringParameter;

  constructor(scope: Construct, id: string, props: CloudWatchAgentProps) {
    super(scope, id);

    const shouldInstallAgent = props.shouldInstallAgent ?? true;

    // Create the asset for the configuration script
    this.configurationScript = ScriptAsset.fromPathConvention(scope, 'CloudWatchConfigurationScriptAsset', {
      osType: props.host.osType,
      baseName: 'configureCloudWatchAgent',
      rootDir: path.join(__dirname, '../scripts/'),
    });

    // Create a new SSM Parameter holding the json configuration
    this.ssmParameterForConfig = new StringParameter(scope, 'StringParameter', {
      description: 'config file for Repository logs config',
      stringValue: props.cloudWatchConfig,
    });

    this.grantRead(props.host);
    this.configure(
      props.host,
      shouldInstallAgent,
      this.node.tryGetContext(CloudWatchAgent.SKIP_CWAGENT_VALIDATION_CTX_VAR) === 'TRUE',
    );
  }

  /**
   * Grants read permissions to the principal on the assets bucket and parameter store.
   */
  private grantRead(grantee: IGrantable): void {
    this.configurationScript.grantRead(grantee);
    this.ssmParameterForConfig.grantRead(grantee);
  }

  /**
   * Configures the CloudWatch Agent on the target host.
   *
   * This is done by adding UserData commands to the target host.
   *
   * @param host The host to configure the CloudWatch agent on
   * @param shouldInstallAgent Attempts to install the CloudWatch agent on the instance if set to true.
   * @param skipValidation Skips the validation of the CloudWatch agent installer if set to true.
   */
  private configure(
    host: IScriptHost,
    shouldInstallAgent: boolean,
    skipValidation: boolean,
  ) {
    const region = Stack.of(this).region;
    if (shouldInstallAgent) {
      // Grant access to the required CloudWatch Agent and GPG installer files.
      const cloudWatchAgentBucket = Bucket.fromBucketArn(this, 'CloudWatchAgentBucket', `arn:aws:s3:::amazoncloudwatch-agent-${region}`);
      cloudWatchAgentBucket.grantRead(host);
      const gpgBucket = Bucket.fromBucketArn(this, 'GpgBucket', `arn:aws:s3:::rfdk-external-dependencies-${region}`);
      gpgBucket.grantRead(host);
    }

    const scriptArgs = [];

    // Flags must be set before positional arguments for some scripts
    if (shouldInstallAgent) {
      scriptArgs.push(CloudWatchAgent.INSTALL_CWAGENT_FLAG);
    }
    if (skipValidation) {
      scriptArgs.push(CloudWatchAgent.SKIP_CWAGENT_VALIDATION_FLAG);
    }

    // This assumes that the CloudWatch agent construct is always put in the same region as the instance or ASG
    // using it, which should always hold true.
    scriptArgs.push(region);

    scriptArgs.push(this.ssmParameterForConfig.parameterName);

    this.configurationScript.executeOn({
      host,
      args: scriptArgs,
    });
  }
}
