/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import { InstanceClass, InstanceSize, InstanceType, Vpc, SubnetType } from '@aws-cdk/aws-ec2';
import { FileSystem } from '@aws-cdk/aws-efs';
import { Construct, Duration, RemovalPolicy, Stack } from '@aws-cdk/core';
import { MountableEfs } from 'aws-rfdk';
import { DatabaseConnection, Repository, Stage, ThinkboxDockerRecipes } from 'aws-rfdk/deadline';

export interface StorageStructProps {
  readonly integStackTag: string;
  readonly provideDocdbEfs: string;
}

export class StorageStruct extends Construct {
  public readonly repo: Repository;
  public readonly docdb: DatabaseCluster;
  public readonly efs: FileSystem;

  constructor(scope: Construct, id: string, props: StorageStructProps) {
    super(scope, id);

    const infrastructureStackName = 'RFDKIntegInfrastructure' + props.integStackTag;
    const stagePath = process.env.DEADLINE_STAGING_PATH!.toString();

    const vpc = Vpc.fromLookup(this, 'Vpc', { tags: { StackName: infrastructureStackName }}) as Vpc;

    const recipes = new ThinkboxDockerRecipes(this, 'DockerRecipes', {
      stage: Stage.fromDirectory(stagePath),
    });
    const version = recipes.version;

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
          vpcSubnets: {
            onePerAz: true,
            subnetType: SubnetType.PRIVATE,
          },
        },
        masterUser: {
          username: 'DocDBUser',
        },
        backup: {
          retention: Duration.days(15),
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
      deadlineDatabaseConnection = undefined;
      deadlineEfs = undefined;
      deadlineMountableEfs = undefined;
    }

    // Define properties for Deadline installer. A unique log group name is created so that logstreams are not assigned
    // to the same log group across tests
    this.repo = new Repository(this, 'Repository', {
      vpc,
      database: deadlineDatabaseConnection,
      fileSystem: deadlineMountableEfs,
      version: version,
      repositoryInstallationTimeout: Duration.minutes(20),
      logGroupProps: {
        logGroupPrefix: Stack.of(this).stackName + '-' + id,
      },
      databaseRemovalPolicy: RemovalPolicy.DESTROY,
    });

    this.docdb = ( deadlineDatabase || this.repo.node.findChild('DocumentDatabase') as DatabaseCluster );
    this.efs = ( deadlineEfs || this.repo.node.findChild('FileSystem') as FileSystem );
  }
}
