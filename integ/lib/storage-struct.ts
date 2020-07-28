/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import { InstanceClass, InstanceSize, InstanceType, Vpc } from '@aws-cdk/aws-ec2';
import { FileSystem } from '@aws-cdk/aws-efs';
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { Construct, RemovalPolicy, Stack } from '@aws-cdk/core';
import { MountableEfs } from 'aws-rfdk';
import { DatabaseConnection, IVersion, Repository } from 'aws-rfdk/deadline';

export interface DeadlineRepositoryInstallationConfig {
  readonly deadlineVersion: string;
  readonly deadlineRepositoryInstallerPath: string | undefined;
  readonly deadlineRepositoryInstallerBucketName: string | undefined;
  readonly deadlineRepositoryInstallerObjectKey: string | undefined;
}

export interface StorageStructProps {
  readonly integStackTag: string;
  readonly provideDocdbEfs: string;
  readonly deadlineRepositoryInstallationConfig: DeadlineRepositoryInstallationConfig;
}

export class StorageStruct extends Construct {
  public readonly repo: Repository;
  public readonly docdb: DatabaseCluster;
  public readonly efs: FileSystem;

  constructor(scope: Construct, id: string, props: StorageStructProps) {
    super(scope, id);

    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    const deadlineInstallConfig = props.deadlineRepositoryInstallationConfig;
    const deadlineVersionString = deadlineInstallConfig.deadlineVersion;
    const deadlineVersionRegex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(deadlineVersionString) as string[];

    let deadlineInstallerBucketName: string;
    let deadlineInstallerBucket: IBucket;
    let deadlineInstallerObjectKey: string;

    switch (deadlineInstallConfig.deadlineRepositoryInstallerPath){
      case undefined:
        deadlineInstallerBucketName = deadlineInstallConfig.deadlineRepositoryInstallerBucketName as string;
        deadlineInstallerObjectKey = deadlineInstallConfig.deadlineRepositoryInstallerObjectKey as string;
        break;
      default:
        const installerAsset = new Asset(this, 'installerAsset', {
          path: deadlineInstallConfig.deadlineRepositoryInstallerPath,
        });
        deadlineInstallerBucketName = installerAsset.s3BucketName;
        deadlineInstallerObjectKey = installerAsset.s3ObjectKey;
        break;
    }
    deadlineInstallerBucket = Bucket.fromBucketName(this, 'InstallerBucket', deadlineInstallerBucketName);

    const versionInts: number[] = [
      parseInt(deadlineVersionRegex[1], 10),
      parseInt(deadlineVersionRegex[2], 10),
      parseInt(deadlineVersionRegex[3], 10),
      parseInt(deadlineVersionRegex[4], 10),
    ];
    const deadlineVersion: IVersion = {
      majorVersion: versionInts[0],
      minorVersion: versionInts[1],
      releaseVersion: versionInts[2],
      linuxInstallers: {
        patchVersion: versionInts[3],
        repository: {
          s3Bucket: deadlineInstallerBucket,
          objectKey: deadlineInstallerObjectKey,
        },
      },
      linuxFullVersionString: () => deadlineVersionString,
    };

    let deadlineDatabase;
    let deadlineDatabaseConnection;
    let deadlineEfs;
    let deadlineMountableEfs;

    // Check the configuration for the test for provideDocdbEfs...
    if (props.provideDocdbEfs === 'true') {
      // If true, create a docDB and efs for the repository to use
      deadlineDatabase = new DatabaseCluster(this, 'DocumentDatabase', {
        instanceProps: {
          instanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
          vpc,
        },
        masterUser: {
          username: 'DocDBUser',
        },
        removalPolicy: RemovalPolicy.DESTROY,
      });
      deadlineDatabaseConnection = DatabaseConnection.forDocDB({
        database: deadlineDatabase,
        login: deadlineDatabase.secret!,
      });

      deadlineEfs = new FileSystem(this, 'FileSystem', {
        vpc,
      });
      deadlineMountableEfs = new MountableEfs(this, {
        filesystem: deadlineEfs,
      });
    }
    else {
      // Otherwise the repository installer will handle creating the docDB and EFS
      deadlineDatabase = undefined;
      deadlineEfs = undefined;
    }

    // Define properties for Deadline installer. A unique log group name is created so that logstreams are not assigned
    // to the same log group across tests
    this.repo = new Repository(this, 'Repository', {
      vpc,
      database: deadlineDatabaseConnection,
      fileSystem: deadlineMountableEfs,
      version: deadlineVersion,
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      databaseRemovalPolicy: RemovalPolicy.DESTROY,
    });

    this.docdb = ( deadlineDatabase || this.repo.node.findChild('DocumentDatabase') as DatabaseCluster );
    this.efs = ( deadlineEfs || this.repo.node.findChild('FileSystem') as FileSystem );
  }
}
