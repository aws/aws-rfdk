/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  IResolvable,
  Stack,
  isResolvableObject,
} from 'aws-cdk-lib';
import {
  OperatingSystemType,
  Port,
} from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import {
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
 * Properties that are required to create a {@link MountableEfs}.
 */
export interface MountableEfsProps {
  /**
   * The {@link https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-efs.FileSystem.html|EFS}
   * filesystem that will be mounted by the object.
   */
  readonly filesystem: efs.IFileSystem;

  /**
   * An optional access point to use for mounting the file-system
   *
   * NOTE: Access points are only supported when using the EFS mount helper. The EFS Mount helper comes pre-installed on
   * Amazon Linux 2. For other Linux distributions, you must have the Amazon EFS client installed on your AMI for this
   * to work properly. For instructions on installing the Amazon EFS client for other distributions, see:
   *
   * https://docs.aws.amazon.com/efs/latest/ug/installing-amazon-efs-utils.html#installing-other-distro
   *
   * @default no access point is used
   */
  readonly accessPoint?: efs.IAccessPoint;

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

  /**
   * If enabled, RFDK will add user-data to the instances mounting this EFS file-system that obtains the mount target
   * IP address using AWS APIs and writes them to the system's `/etc/hosts` file to not require DNS lookups.
   *
   * If mounting EFS from instances in a VPC configured to not use the Amazon-provided DNS Route 53 Resolver server,
   * then the EFS mount targets will not be resolvable using DNS (see
   * https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html) and enabling this will work around that issue.
   *
   * @default false
   */
  readonly resolveMountTargetDnsWithApi?: boolean;
}

/**
 * This class encapsulates scripting that can be used to mount an Amazon Elastic File System onto
 * an instance.
 *
 * An optional EFS access point can be specified for mounting the EFS file-system. For more information on using EFS
 * Access Points, see https://docs.aws.amazon.com/efs/latest/ug/efs-access-points.html. For this to work properly, the
 * EFS mount helper is required. The EFS Mount helper comes pre-installed on Amazon Linux 2. For other Linux
 * distributions, the host machine must have the Amazon EFS client installed. We advise installing the Amazon EFS Client
 * when building your AMI. For instructions on installing the Amazon EFS client for other distributions, see
 * https://docs.aws.amazon.com/efs/latest/ug/installing-amazon-efs-utils.html#installing-other-distro.
 *
 * NOTE: Without an EFS access point, the file-system is writeable only by the root user.
 *
 * Security Considerations
 * ------------------------
 * - Using this construct on an instance will result in that instance dynamically downloading and running scripts
 *   from your CDK bootstrap bucket when that instance is launched. You must limit write access to your CDK bootstrap
 *   bucket to prevent an attacker from modifying the actions performed by these scripts. We strongly recommend that
 *   you either enable Amazon S3 server access logging on your CDK bootstrap bucket, or enable AWS CloudTrail on your
 *   account to assist in post-incident analysis of compromised production environments.
 */
export class MountableEfs implements IMountableLinuxFilesystem {
  /**
   * The underlying EFS filesystem that is mounted
   */
  public readonly fileSystem: efs.IFileSystem;

  /**
   * The optional access point used to mount the EFS file-system
   */
  public readonly accessPoint?: efs.IAccessPoint;

  constructor(protected readonly scope: Construct, protected readonly props: MountableEfsProps) {
    this.fileSystem = props.filesystem;
    this.accessPoint = props.accessPoint;
  }

  /**
   * @inheritdoc
   */
  public mountToLinuxInstance(target: IMountingInstance, mount: LinuxMountPointProps): void {
    if (target.osType !== OperatingSystemType.LINUX) {
      throw new Error('Target instance must be Linux.');
    }

    if (Construct.isConstruct(target)) {
      target.node.addDependency(this.props.filesystem.mountTargetsAvailable);
    }

    if (this.props.accessPoint) {
      const grantActions = MountPermissionsHelper.toEfsIAMActions(mount?.permissions);
      if (this.accessPointRequiresClientRootAccess(this.props.accessPoint)) {
        grantActions.push('elasticfilesystem:ClientRootAccess');
      }
      target.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
        resources: [
          (this.props.filesystem.node.defaultChild as efs.CfnFileSystem).attrArn,
        ],
        actions: grantActions,
        conditions: {
          StringEquals: {
            'elasticfilesystem:AccessPointArn': this.props.accessPoint.accessPointArn,
          },
        },
      }));
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
    if (this.props.accessPoint) {
      mountOptions.push(
        'iam',
        `accesspoint=${this.props.accessPoint.accessPointId}`,
      );
    }
    if (this.props.extraMountOptions) {
      mountOptions.push(...this.props.extraMountOptions);
    }
    const mountOptionsStr: string = mountOptions.join(',');

    const resolveMountTargetDnsWithApi = this.props.resolveMountTargetDnsWithApi ?? false;
    if (resolveMountTargetDnsWithApi) {
      const describeMountTargetResources = [
        (this.props.filesystem.node.defaultChild as efs.CfnFileSystem).attrArn,
      ];
      if (this.props.accessPoint) {
        describeMountTargetResources.push(this.props.accessPoint.accessPointArn);
      }

      target.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
        resources: describeMountTargetResources,
        actions: ['elasticfilesystem:DescribeMountTargets'],
      }));
    }

    target.userData.addCommands(
      'TMPDIR=$(mktemp -d)',
      'pushd "$TMPDIR"',
      `unzip ${mountScript}`,
      `bash ./mountEfs.sh ${this.props.filesystem.fileSystemId} ${mountDir} ${resolveMountTargetDnsWithApi} ${mountOptionsStr}`,
      'popd',
      `rm -f ${mountScript}`,
    );
  }

  /**
   * @inheritdoc
   */
  public usesUserPosixPermissions(): boolean {
    if (this.accessPoint) {
      // We cannot determine if the access point forces a POSIX user in the import case
      if (!(this.accessPoint instanceof efs.AccessPoint)) {
        throw new Error(`MountableEfs.usesUserPosixPermissions() only supports efs.AccessPoint instances, got "${this.accessPoint.constructor.name}"`);
      }

      const accessPointResource = this.accessPoint.node.defaultChild as efs.CfnAccessPoint;
      return !accessPointResource.posixUser;
    }
    return true;
  }

  /**
   * Uses a CDK escape-hatch to fetch the UID/GID of the access point POSIX user.
   *
   * @param accessPoint The access point to obtain the POSIX user for
   */
  private getAccessPointPosixUser(accessPoint: efs.AccessPoint): efs.PosixUser | IResolvable | undefined {
    const accessPointResource = accessPoint.node.defaultChild as efs.CfnAccessPoint;
    return accessPointResource.posixUser;
  }

  /**
   * Uses a synthesis-time check to determine whether an access point is setting its UID/GID to 0 (root). Mounting such
   * an access point requires the `ClientRootAccess` IAM permission.
   *
   * If this introspection is possible and the access point is determined to require root access, the method returns
   * true.
   *
   * If there is no information at synthesis-time, the method returns false as a secure default.
   *
   * @param accessPoint The access point to introspect
   */
  private accessPointRequiresClientRootAccess(accessPoint: efs.IAccessPoint): boolean {
    if (accessPoint instanceof efs.AccessPoint) {
      const posixUser = this.getAccessPointPosixUser(accessPoint);
      // The following code path is cannot be triggered using the L2 construct for EFS Access Points. It currently
      // accepts a PosixUser struct. We will skip coverage for the time-being.
      /* istanbul ignore next */
      if (isResolvableObject(posixUser)) {
        // We can't know at synthesis time whether this POSIX user is root. Use secure defaults.
        return false;
      }
      if (!posixUser) {
        // No POSIX user specified we will not grant ClientRootAccess permission to opt on the side of secure defaults.
        return false;
      }
      // We have synthesis-time values for the UID/GID being set in the access point. Return true if either is 0 (root).
      return Number(posixUser.uid) === 0 || Number(posixUser.gid) === 0;
    }
    else {
      // This code path is for imported or custom-implementations of efs.AccessPoint
      // We cannot introspect the access point, so we will impose secure defaults and not grant ClientRootAccess.
      return false;
    }
  }

  /**
   * Fetch the Asset singleton for the EFS mounting scripts, or generate it if needed.
   */
  protected mountAssetSingleton(scope: IConstruct): Asset {
    const stack = Stack.of(scope);
    const uuid = '2b31c419-5b0b-4bb8-99ad-5b2575b2c06b';
    const uniqueId = 'MountableEfsAsset' + uuid.replace(/[-]/g, '');
    return (stack.node.tryFindChild(uniqueId) as Asset) ?? new Asset(stack, uniqueId, {
      path: path.join(__dirname, '..', 'scripts', 'bash'),
      exclude: [ '**/*', '!mountEfs.sh', '!metadataUtilities.sh', '!ec2-certificates.crt' ],
    });
  }
}
