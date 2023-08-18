/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDB, AWSError } from 'aws-sdk';

export class CompositeStringIndexTable {
  public static readonly API_VERSION = '2012-08-10';

  public static async fromExisting(client: DynamoDB, tableName: string): Promise<CompositeStringIndexTable> {
    // Determine the key schema of the table
    // We let this throw if the table does not exist.

    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#describeTable-property
    const describeResponse = await client.describeTable({ TableName: tableName }).promise();
    if (!describeResponse.Table) {
      throw Error(`Could not describeTable for Table '${tableName}'`);
    }
    const keySchema = describeResponse.Table.KeySchema;
    if (!keySchema) {
      throw Error(`Could not get KeySchema for Table '${tableName}'`);
    }
    const attributes = describeResponse.Table.AttributeDefinitions;
    if (!attributes) {
      throw Error(`Could not get Attributes for Table '${tableName}'`);
    }

    // Find the names of the Primary & Sort keys.
    const hashIndex: number = keySchema.findIndex(item => item.KeyType === 'HASH');
    const sortIndex: number = keySchema.findIndex(item => item.KeyType === 'RANGE');
    if (hashIndex < 0 || sortIndex < 0) {
      console.debug(`Error initializing DynamoDatabase. KeySchema: ${JSON.stringify(keySchema)}`);
      if (hashIndex < 0) {
        throw Error(`Could not find PrimaryKey of Table '${tableName}'`);
      } else {
        throw Error(`Could not find SortKey of Table '${tableName}'`);
      }
    }
    const primaryKey = keySchema[hashIndex].AttributeName;
    const sortKey = keySchema[sortIndex].AttributeName;

    // Make sure that the primary & sort key types are both string types
    // (( We didn't make this flexible enough for other attribute types for the key ))
    if ('S' !== attributes.find(item => item.AttributeName === primaryKey)?.AttributeType) {
      throw Error(`Primary key '${primaryKey}' must be string type`);
    }
    if ('S' !== attributes.find(item => item.AttributeName === sortKey)?.AttributeType) {
      throw Error(`Sort key '${sortKey}' must be string type`);
    }

    return new CompositeStringIndexTable(
      client,
      tableName,
      primaryKey,
      sortKey,
    );
  }

  /**
   * A simplified interface to create a new DynamoDB Table with a composite index
   * consisting of a pair of string attributes.
   * @param args
   */
  public static async createNew(args: {
    client: DynamoDB,
    name: string,
    primaryKeyName: string,
    sortKeyName: string,
    region?: string,
    tags?: Array<{ Key: string, Value: string }>
  }): Promise<CompositeStringIndexTable> {
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#createTable-property
    const request: DynamoDB.CreateTableInput = {
      TableName: args.name,
      AttributeDefinitions: [
        {
          AttributeName: args.primaryKeyName,
          AttributeType: 'S',
        },
        {
          AttributeName: args.sortKeyName,
          AttributeType: 'S',
        },
      ],
      KeySchema: [
        {
          AttributeName: args.primaryKeyName,
          KeyType: 'HASH',
        },
        {
          AttributeName: args.sortKeyName,
          KeyType: 'RANGE',
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: args.tags,
    };
    try {
      await args.client.createTable(request).promise();

      const table: CompositeStringIndexTable = new CompositeStringIndexTable(
        args.client,
        args.name,
        args.primaryKeyName,
        args.sortKeyName,
      );
      return table;
    } catch (e) {
      throw new Error(`CreateTable '${args.name}': ${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
    }
  }

  public readonly primaryKey: string;
  public readonly sortKey: string;
  protected readonly client: DynamoDB;
  // tableName will only be undefined if the Table has been deleted.
  protected tableName: string | undefined;

  protected constructor(
    client: DynamoDB,
    name: string,
    primaryKey: string,
    sortKey: string,
  ) {
    this.client = client;
    this.tableName = name;
    this.primaryKey = primaryKey;
    this.sortKey = sortKey;
  }

  /**
   * Delete this table from DynamoDB.
   */
  public async deleteTable(): Promise<void> {
    if (!this.tableName) {
      return; // Already gone.
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#deleteTable-property
    const request: DynamoDB.DeleteTableInput = {
      TableName: this.tableName,
    };

    try {
      await this.client.deleteTable(request).promise();
      this.tableName = undefined;

    } catch (e) {
      if ((e as AWSError)?.code === 'ResourceNotFoundException') {
        // Already gone. We're good.
        this.tableName = undefined;
      } else {
        throw new Error(`DeleteTable '${this.tableName}': ${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
      }
    }
  }

  /**
   * Puts an item into the Table. The item it put into the table index with the given
   * primary and sort key attribute values. If any attributes are given, then they are
   * stored in the item.
   *
   * @param props
   * @throws Error if the request fails.
   * @returns True if the item was stored in the table; false otherwise
   */
  public async putItem(props: {
    primaryKeyValue: string,
    sortKeyValue: string,
    /**
     * Additional attribute values to store in the table. This must
     * not contain values for the primary & sort key attributes.
     * Property key is the attribute name.
     */
    attributes?: object,
    /**
     * If true, then allow dynamo to overwrite an existing value at the index
     * if one exists.
     * @default false
     */
    allow_overwrite?: boolean,
  }): Promise<boolean> {
    if (!this.tableName) {
      throw Error('Attempt to PutItem in deleted table');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#putItem-property
    //      https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/Converter.html

    const item = DynamoDB.Converter.marshall(props.attributes ?? {});
    item[this.primaryKey] = DynamoDB.Converter.input(props.primaryKeyValue);
    item[this.sortKey] = DynamoDB.Converter.input(props.sortKeyValue);
    const request: DynamoDB.PutItemInput = {
      TableName: this.tableName,
      Item: item,
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE',
      ReturnValues: 'NONE',
    };
    if (!props.allow_overwrite) {
      request.ConditionExpression = `attribute_not_exists(${this.primaryKey}) AND attribute_not_exists(${this.sortKey})`;
    }
    try {
      console.debug(`Dynamo.PutItem request: ${JSON.stringify(request)}`);
      const response = await this.client.putItem(request).promise();
      console.debug(`PutItem response: ${JSON.stringify(response)}`);
    } catch (e) {
      if ((e as AWSError)?.code === 'ConditionalCheckFailedException' && !props.allow_overwrite) {
        return false;
      }
      throw new Error(`PutItem '${props.primaryKeyValue}' '${props.sortKeyValue}:" ` +
        `${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
    }
    return true;
  }

  /**
   * Does a consistent read to get the item from the Table with the given primary and sort key, if one exists.
   *
   * @param props
   * @throws Error if the request fails.
   * @returns The attributes of the item **excluding** the primary and sort key, or undefined if there was no item
   *         found.
   */
  public async getItem(props: {
    primaryKeyValue: string,
    sortKeyValue: string,
  }): Promise<{ [key: string]: any } | undefined> {
    if (!this.tableName) {
      throw Error('Attempt to GetItem from deleted table');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#getItem-property
    const key: { [key: string]: any } = {};
    key[this.primaryKey] = props.primaryKeyValue;
    key[this.sortKey] = props.sortKeyValue;
    const request: DynamoDB.GetItemInput = {
      TableName: this.tableName,
      Key: DynamoDB.Converter.marshall(key),
      ConsistentRead: true,
      ReturnConsumedCapacity: 'NONE',
    };
    try {
      console.debug(`Dynamo.GetItem request: ${JSON.stringify(request)}`);
      const response: DynamoDB.GetItemOutput = await this.client.getItem(request).promise();
      console.debug(`GetItem response: ${JSON.stringify(response)}`);

      if (!response.Item) {
        // The item was not present in the DB
        return undefined;
      }
      const item = DynamoDB.Converter.unmarshall(response.Item);
      delete item[this.primaryKey];
      delete item[this.sortKey];
      return item;
    } catch (e) {
      throw new Error(`GetItem '${props.primaryKeyValue}' '${props.sortKeyValue}:" ` +
        `${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
    }
  }

  /**
   * Deletes the item from the table that is indexed by the given primary and sort key value
   * @param props
   * @throws Error if the request fails
   * @returns True if the item was deleted; false if there was no matching item to delete.
   */
  public async deleteItem(props: {
    primaryKeyValue: string,
    sortKeyValue: string,
  }): Promise<boolean> {
    if (!this.tableName) {
      throw Error('Attempt to DeleteItem from deleted table');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#deleteItem-property
    const key: { [key: string]: any } = {};
    key[this.primaryKey] = props.primaryKeyValue;
    key[this.sortKey] = props.sortKeyValue;
    const request: DynamoDB.DeleteItemInput = {
      TableName: this.tableName,
      Key: DynamoDB.Converter.marshall(key),
      ReturnValues: 'ALL_OLD',
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE',
    };
    try {
      console.debug(`Dynamo.DeleteItem request: ${JSON.stringify(request)}`);
      const response: DynamoDB.DeleteItemOutput = await this.client.deleteItem(request).promise();
      console.debug(`DeleteItem response: ${JSON.stringify(response)}`);

      if (response.Attributes) {
        // There was a match in the DB, and we deleted it
        return true;
      }
      return false;
    } catch (e) {
      throw new Error(`DeleteItem '${props.primaryKeyValue}' '${props.sortKeyValue}:" ` +
        `${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
    }
  }

  /**
   * Query the table for all items with the given primary key value.
   * @param primaryKeyValue
   * @param pageLimit Maximum number of table items to evaluate per request.
   * @throws Error if the request fails.
   * @returns All of the found items, keyed by their unique sort key values. i.e.
   *         {
   *             'sort key value 1': {
   *                 # attributes other than sort & primary key for this item
   *             },
   *             'sort key value 2': {
   *                 # attributes other than sort & primary key for this item
   *             },
   *             ... etc
   *         }
   */
  public async query(
    primaryKeyValue: string,
    pageLimit?: number,
  ): Promise<{ [key: string]: { [key: string]: any }}> {
    if (!this.tableName) {
      throw Error('Attempt to Query a deleted table');
    }
    // See: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#query-property
    const request: DynamoDB.QueryInput = {
      TableName: this.tableName,
      Select: 'ALL_ATTRIBUTES',
      ConsistentRead: true,
      ReturnConsumedCapacity: 'NONE',
      ExpressionAttributeNames: {
        '#PK': this.primaryKey,
      },
      ExpressionAttributeValues: {
        ':PKV': DynamoDB.Converter.input(primaryKeyValue),
      },
      KeyConditionExpression: '#PK = :PKV',
      Limit: pageLimit,
    };
    console.debug(`DynamoDB.Query: ${JSON.stringify(request)}`);
    const items: { [key: string]: { [key: string]: any }} = {};
    try {
      do {
        const response: DynamoDB.QueryOutput = await this.client.query(request).promise();
        request.ExclusiveStartKey = response.LastEvaluatedKey;
        if (response.Items) {
          for (const item of response.Items) {
            const unmarshalled = DynamoDB.Converter.unmarshall(item);
            const sortValue: string = unmarshalled[this.sortKey];
            delete unmarshalled[this.primaryKey];
            delete unmarshalled[this.sortKey];
            items[sortValue] = unmarshalled;
          }
        }
      } while (request.ExclusiveStartKey);
      return items;
    } catch (e) {
      throw new Error(`Query '${primaryKeyValue}':" ${(e as AWSError)?.code} -- ${(e as AWSError)?.message}`);
    }
  }
}
