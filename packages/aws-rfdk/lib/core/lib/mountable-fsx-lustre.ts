/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  OperatingSystemType,
  Port,
} from '@aws-cdk/aws-ec2';
import {
  LustreFileSystem,
} from '@aws-cdk/aws-fsx';
import {
  Asset,
} from '@aws-cdk/aws-s3-assets';
import {
  Construct,
  IConstruct,
  Stack,
} from '@aws-cdk/core';
import {
  MountPermissionsHelper,
} from './mount-permissions-helper';
import {
  IMountableLinuxFilesystem,
  IMountingInstance,
  LinuxMountPointProps,
} from './mountable-filesystem';

/**
 * Properties that are required to create a {@link MountableFsxLustre}.
 */
export interface MountableFsxLustreProps {
  /**
   * The {@link https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-fsx.LustreFileSystem.html|FSx for Lustre}
   * filesystem that will be mounted by the object.
   */
  readonly filesystem: LustreFileSystem;

  /**
   * The fileset to mount.
   * @see https://docs.aws.amazon.com/fsx/latest/LustreGuide/mounting-from-fileset.html
   * @default Mounts the root of the filesystem.
   */
  readonly fileset?: string;

  /**
   * Extra NFSv4 mount options that will be added to /etc/fstab for the file system.
   * See: {@link https://www.man7.org/linux/man-pages//man5/nfs.5.html}
   *
   * The given values will be joined together into a single string by commas.
   * ex: ['soft', 'rsize=4096'] will become 'soft,rsize=4096'
   *
   * @default No extra options.
   */
  readonly extraMountOptions?: string[];
}

/**
 * This class encapsulates scripting that can be used to mount an Amazon FSx for Lustre File System onto
 * an instance.
 *
 * Security Considerations
 * ------------------------
 * - Using this construct on an instance will result in that instance dynamically downloading and running scripts
 *   from your CDK bootstrap bucket when that instance is launched. You must limit write access to your CDK bootstrap
 *   bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly recommend that
 *   you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS CloudTrail on your
 *   account to assist in post-incident analysis of compromised production environments.
 */
export class MountableFsxLustre implements IMountableLinuxFilesystem {
  constructor(protected readonly scope: Construct, protected readonly props: MountableFsxLustreProps) {}

  /**
   * @inheritdoc
   */
  public mountToLinuxInstance(target: IMountingInstance, mount: LinuxMountPointProps): void {
    if (target.osType !== OperatingSystemType.LINUX) {
      throw new Error('Target instance must be Linux.');
    }

    target.connections.allowTo(this.props.filesystem, this.props.filesystem.connections.defaultPort as Port);

    const mountScriptAsset = this.mountAssetSingleton(target);
    mountScriptAsset.grantRead(target.grantPrincipal);
    const mountScript: string = target.userData.addS3DownloadCommand({
      bucket: mountScriptAsset.bucket,
      bucketKey: mountScriptAsset.s3ObjectKey,
    });

    const mountDir: string = path.posix.normalize(mount.location);
    const mountOptions: string[] = [ MountPermissionsHelper.toLinuxMountOption(mount.permissions) ];
    if (this.props.extraMountOptions) {
      mountOptions.push(...this.props.extraMountOptions);
    }
    const mountOptionsStr: string = mountOptions.join(',');
    const mountName = this.props.fileset ? path.posix.join(this.props.filesystem.mountName, this.props.fileset) : this.props.filesystem.mountName;

    target.userData.addCommands(
      'TMPDIR=$(mktemp -d)',
      'pushd "$TMPDIR"',
      `unzip ${mountScript}`,
      'bash ./installLustreClient.sh',
      `bash ./mountFsxLustre.sh ${this.props.filesystem.fileSystemId} ${mountDir} ${mountName} ${mountOptionsStr}`,
      'popd',
      `rm -f ${mountScript}`,
    );
  }

  /**
   * Fetch the Asset singleton for the FSx for Lustre mounting scripts, or generate it if needed.
   */
  protected mountAssetSingleton(scope: IConstruct): Asset {
    const stack = Stack.of(scope);
    const uuid = '0db888da-5901-4948-aaa5-e71c541c8060';
    const uniqueId = 'MountableFsxLustreAsset' + uuid.replace(/[-]/g, '');
    return (stack.node.tryFindChild(uniqueId) as Asset) ?? new Asset(stack, uniqueId, {
      path: path.join(__dirname, '..', 'scripts', 'bash'),
      exclude: [ '**/*', '!mountFsxLustre.sh', '!installLustreClient.sh', '!metadataUtilities.sh', '!ec2-certificates.crt' ],
    });
  }
}
