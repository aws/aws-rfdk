/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import { OperatingSystemType, UserData } from '@aws-cdk/aws-ec2';
import { IGrantable } from '@aws-cdk/aws-iam';
import { Asset, AssetProps } from '@aws-cdk/aws-s3-assets';
import { Construct } from '@aws-cdk/core';

enum ScriptExtension {
  '.sh' = OperatingSystemType.LINUX,
  '.ps1' = OperatingSystemType.WINDOWS
}

enum ScriptPathPrefix {
  'bash' = OperatingSystemType.LINUX,
  'powershell' = OperatingSystemType.WINDOWS
}

/**
 * Specification of a script within the RFDK repo based on the script directory structure convention
 */
export interface ConventionalScriptPathParams {
  /**
   * The operating system that the script is intended for
   */
  readonly osType: OperatingSystemType;

  /**
   * The basename of the script without the file's extension
   */
  readonly baseName: string;

  /**
   * The root directory that contains the script
   */
  readonly rootDir: string;
}

/**
 * This method returns the path to a script based on RFDK conventional directory structure and the target
 * operating system of the script.
 *
 * The directory structure convention keeps linux scripts in `${scriptRoot}//bash/*.sh` and Windows scripts in
 * `${scriptRoot}/powershell/*.ps1`.
 *
 * @param osType
 * @param scriptName
 */
function getConventionalScriptPath(params: ConventionalScriptPathParams): string {
  const { rootDir: scriptDir, baseName: scriptName, osType } = params;
  return path.join(
    scriptDir,
    ScriptPathPrefix[osType],
    `${scriptName}${ScriptExtension[osType]}`,
  );
}

/**
 * An interface that unifies the common methods and properties of:
 *
 * *   {@link @aws-cdk/aws-ec2#Instance}
 * *   {@link @aws-cdk/aws-autoscaling#AutoScalingGroup}
 *
 * so that they can be uniformly targeted to download and execute a script asset.
 */
export interface IScriptHost extends IGrantable {
  /**
   * The operating system of the script host
   */
  readonly osType: OperatingSystemType;

  /**
   * The user data of the script host
   */
  readonly userData: UserData;
}

/**
 * Interface of properties for adding UserData commands to download and executing a {@link ScriptAsset} on a host
 * machine.
 */
export interface ExecuteScriptProps {
  /**
   * The host to run the script against.
   *
   * For example, instances of:
   *
   * *   {@link @aws-cdk/aws-ec2#Instance}
   * *   {@link @aws-cdk/aws-autoscaling#AutoScalingGroup}
   *
   * can be used.
   */
  readonly host: IScriptHost;

  /**
   * Command-line arguments to invoke the script with.
   *
   * @remarks
   *
   * If supplied, these arguments are simply concatenated with a space character between. No shell escaping is done.
   *
   * @default No command-line arguments
   */
  readonly args?: string[];
}

/**
 * Properties for constructing a {@link ScriptAsset}
 */
export interface ScriptAssetProps extends AssetProps {}

/**
 * An S3 asset that contains a shell script intended to be executed through instance user data.
 *
 * This is used by other constructs to generalize the concept of a script
 * (bash or powershell) that executes on an instance.
 * It provides a wrapper around the CDK’s S3 Asset construct
 * ( https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-s3-assets.Asset.html )
 *
 * The script asset is placed into and fetched from the CDK bootstrap S3 bucket.
 *
 * @ResourcesDeployed
 * 1) An Asset which is uploaded to the bootstrap S3 bucket.
 *
 * @ResidualRisk
 * - Every principal that has permissions to read this script asset,
 *   also has permissions to read ***everything*** in the bootstrap bucket.
 */
export class ScriptAsset extends Asset {
  /**
   * Returns a {@link ScriptAsset} instance by computing the path to the script using RFDK's script directory structure
   * convention.
   *
   * By convention, scripts are kept in a `scripts` directory in each `aws-rfdk/*` package. The scripts are organized
   * based on target shell (and implicitly target operating system). The directory structure looks like:
   *
   * ```
   * scripts/
   *   bash/
   *     script-one.sh
   *     script-two.sh
   *   powershell
   *     script-one.ps1
   *     script-one.ps1
   * ```
   *
   * @param scope The scope for the created {@link ScriptAsset}
   * @param id The construct id for the created {@link ScriptAsset}
   * @param scriptParams The parameters that are used to compute the conventional path to the script file
   */
  public static fromPathConvention(scope: Construct, id: string, scriptParams: ConventionalScriptPathParams): ScriptAsset {
    const scriptPath = getConventionalScriptPath(scriptParams);

    return new ScriptAsset(scope, id, { path: scriptPath });
  }

  constructor(scope: Construct, id: string, props: ScriptAssetProps) {
    super(scope, id, props);
  }

  /**
   * Adds commands to the {@link IScriptHost} to download and execute the ScriptAsset.
   *
   * @param props The parameters for executing the script
   */
  public executeOn(props: ExecuteScriptProps) {
    const { host, args } = props;

    // Grant permission to fetch the script asset
    this.grantRead(host);

    // Add a command to the user data to download the script asset
    const instanceScriptPath = host.userData.addS3DownloadCommand({
      bucket: this.bucket,
      bucketKey: this.s3ObjectKey,
    });

    // Add a command to the user data to execute the downloaded script
    host.userData.addExecuteFileCommand({
      filePath: instanceScriptPath,
      arguments: (args || []).join(' '),
    });
  }
}
