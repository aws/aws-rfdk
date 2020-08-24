/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDB } from 'aws-sdk';

import { CompositeStringIndexTable } from '../dynamodb';
import { SimpleCustomResource } from './simple-resource';

/* istanbul ignore file */

export abstract class DynamoBackedCustomResource extends SimpleCustomResource {
  /**
   * The DynamoDB database should be initialized with CDK and passed in by name in the Lambda Function's environment.
   * Implementing classes can then utilize it as a CompositeStringIndexTable to get functionality intended to help
   * track the resources that get created, so they can be destroyed properly later.
   */
  private readonly tableName: string;
  private readonly dynamoDbClient: DynamoDB;
  /**
   * The resource table uses the databaseName and the dynamoDbClient to fetch the DynamoDB table that backs it.
   * Ideally it would be readonly and initialized in the constructor, but it can't because the call is asynchronous.
   * Keeping it private and trying to limit its access through getResourceTable() is meant to help avoid mutation.
   */
  private resourceTable?: CompositeStringIndexTable;

  constructor(dynamoDbClient: DynamoDB) {
    super();
    this.dynamoDbClient = dynamoDbClient;

    if (!process.env.DATABASE) {
      throw Error("Cannot retrieve value of 'DATABASE' environment variable");
    }
    this.tableName = process.env.DATABASE;
    console.log(`Using DynamoDB Table for recording state: ${this.tableName}`);
  }

  /**
   * This method is provided to do a quick permisions check on the database to make sure that all operations that are
   * performed by the CompositeStringIndexTable are available.
   */
  protected async databasePermissionsCheck(database: CompositeStringIndexTable): Promise<void> {
    if (!this.debugMode) { return; }
    const uniqueContent = new Date().toISOString();
    const physicalId: string = `TestingItem${uniqueContent}`;
    await database.putItem({
      primaryKeyValue: physicalId,
      sortKeyValue: `SortValue${uniqueContent}`,
      attributes: {
        Key: `TestKey${uniqueContent}`,
      },
    });
    await database.getItem({
      primaryKeyValue: physicalId,
      sortKeyValue: `SortValue${uniqueContent}`,
    });
    await database.query(physicalId);
    await database.deleteItem({
      primaryKeyValue: physicalId,
      sortKeyValue: `SortValue${uniqueContent}`,
    });
  }

  protected async getResourceTable(): Promise<CompositeStringIndexTable> {
    if (!this.resourceTable) {
      this.resourceTable = await CompositeStringIndexTable.fromExisting(
        this.dynamoDbClient,
        this.tableName,
      );
    }
    return this.resourceTable;
  }
}
