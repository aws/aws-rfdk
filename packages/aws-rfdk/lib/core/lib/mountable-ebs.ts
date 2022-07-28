/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  Stack,
} from 'aws-cdk-lib';
import {
  IVolume,
  OperatingSystemType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Effect,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import {
  Asset,
} from 'aws-cdk-lib/aws-s3-assets';
import { Construct, IConstruct } from 'constructs';

import {
  MountPermissionsHelper,
} from './mount-permissions-helper';
import {
  IMountableLinuxFilesystem,
  IMountingInstance,
  LinuxMountPointProps,
} from './mountable-filesystem';

/**
 * Block format options for formatting a blank/new BlockVolume
 */
export enum BlockVolumeFormat {
  /**
   * See: https://en.wikipedia.org/wiki/Ext3
   */
  EXT3 = 'ext3',

  /**
   * See: https://en.wikipedia.org/wiki/Ext4
   */
  EXT4 = 'ext4',

  /**
   * See: https://en.wikipedia.org/wiki/XFS
   */
  XFS = 'xfs',
}

/**
 * Properties that are required to create a {@link MountableBlockVolume}.
 */
export interface MountableBlockVolumeProps {
  /**
   * The {@link https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.Volume.html|EBS Block Volume}
   * that will be mounted by this object.
   */
  readonly blockVolume: IVolume;

  /**
   * The filesystem format of the block volume.
   *
   * @remark If the volume is already formatted, but does not match this format then
   * the mounting script employed by {@link MountableBlockVolume} will mount the volume as-is
   * if it is able. No formatting will be performed.
   *
   * @default BlockVolumeFormat.XFS
   */
  readonly volumeFormat?: BlockVolumeFormat;

  /**
   * Extra mount options that will be added to /etc/fstab for the file system.
   * See the Linux man page for mounting the Volume's file system type for information
   * on available options.
   *
   * The given values will be joined together into a single string by commas.
   * ex: ['soft', 'rsize=4096'] will become 'soft,rsize=4096'
   *
   * @default No extra options.
   */
  readonly extraMountOptions?: string[];
}

/**
 * This class encapsulates scripting that can be used by an instance to mount, format, and resize an
 * Amazon Elastic Block Store (EBS) Volume to itself when it is launched. The scripting is added to
 * the instance's UserData to be run when the instance is first launched.
 *
 * The script that is employed by this class will:
 * 1) Attach the volume to this instance if it is not already attached;
 * 2) Format the block volume to the filesystem format that's passed as an argument to this script but,
 *   **ONLY IF** the filesystem has no current format;
 * 3) Mount the volume to the given mount point with the given mount options; and
 * 4) Resize the filesystem on the volume if the volume is larger than the formatted filesystem size.
 *
 * Note: This does **NOT** support multiple partitions on the EBS Volume; the script will exit with a failure code
 * when it detects multiple partitions on the device. It is expected that the whole block device is a single partition.
 *
 * Security Considerations
 * ------------------------
 * - Using this construct on an instance will result in that instance dynamically downloading and running scripts
 *   from your CDK bootstrap bucket when that instance is launched. You must limit write access to your CDK bootstrap
 *   bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly recommend that
 *   you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS CloudTrail on your
 *   account to assist in post-incident analysis of compromised production environments.
 *
 * @remark If using this script with an instance within an AWS Auto Scaling Group (ASG) and you resize
 * the EBS volume, then you can terminate the instance to let the ASG replace the instance and benefit
 * from the larger volume size when this script resizes the filesystem on instance launch.
 */
export class MountableBlockVolume implements IMountableLinuxFilesystem {
  constructor(protected readonly scope: Construct, protected readonly props: MountableBlockVolumeProps) {}

  /**
   * @inheritdoc
   */
  public mountToLinuxInstance(target: IMountingInstance, mount: LinuxMountPointProps): void {
    if (target.osType !== OperatingSystemType.LINUX) {
      throw new Error('Target instance must be Linux.');
    }

    this.grantRequiredPermissions(target);

    const mountScriptAsset = this.mountAssetSingleton(target);
    mountScriptAsset.grantRead(target.grantPrincipal);
    const mountScriptZip: string = target.userData.addS3DownloadCommand({
      bucket: mountScriptAsset.bucket,
      bucketKey: mountScriptAsset.s3ObjectKey,
    });

    const mountDir: string = path.posix.normalize(mount.location);
    const mountOptions: string[] = [ MountPermissionsHelper.toLinuxMountOption(mount.permissions) ];
    if (this.props.extraMountOptions) {
      mountOptions.push( ...this.props.extraMountOptions);
    }
    const mountOptionsStr: string = mountOptions.join(',');

    const volumeFormat = this.props.volumeFormat ?? BlockVolumeFormat.XFS;
    target.userData.addCommands(
      'TMPDIR=$(mktemp -d)',
      'pushd "$TMPDIR"',
      `unzip ${mountScriptZip}`,
      `bash ./mountEbsBlockVolume.sh ${this.props.blockVolume.volumeId} ${volumeFormat} ${mountDir} ${mountOptionsStr} ""`,
      'popd',
      `rm -f ${mountScriptZip}`,
    );
  }

  /**
   * @inheritdoc
   */
  public usesUserPosixPermissions(): boolean {
    return true;
  }

  /**
   * Grant required permissions to the target. The mounting script requires two permissions:
   * 1) Permission to describe the volume
   * 2) Permission to attach the volume
   */
  protected grantRequiredPermissions(target: IMountingInstance): void {
    // Volume.grantAttachVolumeByResourceTag() requires that the target be a construct; it adds a tag to the construct.
    // So, we fail if we're given something that is not compatible.
    if (!Construct.isConstruct(target)) {
      throw new Error('Target instance must be a construct. It cannot be constructed from attributes.');
    }

    // See: https://docs.aws.amazon.com/IAM/latest/UserGuide/list_amazonec2.html
    // Accessed July 2020
    // ec2:DescribeVolumes does not support resource or condition constraints.
    target.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ec2:DescribeVolumes',
      ],
      resources: ['*'],
    }));

    this.props.blockVolume.grantAttachVolumeByResourceTag(target.grantPrincipal, [target]);
  }

  /**
   * Fetch the Asset singleton for the Volume mounting scripts, or generate it if needed.
   */
  protected mountAssetSingleton(scope: IConstruct): Asset {
    const stack = Stack.of(scope);
    const uuid = '01ca4aa6-d440-4f83-84d8-80a5a21fd0e3';
    const uniqueId = 'MountableBlockVolumeAsset' + uuid.replace(/[-]/g, '');
    return (stack.node.tryFindChild(uniqueId) as Asset) ?? new Asset(stack, uniqueId, {
      path: path.join(__dirname, '..', 'scripts', 'bash'),
      exclude: [ '**/*', '!mountEbsBlockVolume.sh', '!metadataUtilities.sh', '!ec2-certificates.crt' ],
    });
  }
}
