/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { randomBytes } from 'crypto';
import {
  CreateTableCommand,
  CreateTableCommandOutput,
  DescribeTableCommand,
  DynamoDBClient,
  ScalarAttributeType,
  DeleteTableCommand,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  QueryCommand,
  CreateTableInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as dynalite from 'dynalite';

import { CompositeStringIndexTable } from '../composite-table';

// Enable/disable debugging statements.
const DEBUG = false;
if (!DEBUG) {
  console.debug = () => { };
}

// Test class to expose constructor and tableName
class TestTable extends CompositeStringIndexTable {
  public tableName: string | undefined;

  public constructor(
    client: DynamoDBClient,
    name: string,
    primaryKey: string,
    sortKey: string,
  ) {
    super(
      client,
      name,
      primaryKey,
      sortKey,
    );
  }
}

/**
 * This class is being refactored to use mocks over an actualy connection to DynamoDB. All the DynamoDB tests were
 * converted to use dynalite, a package that sets up a server to replicate DynamoDB locally. These tests can be found
 * in the first describe() block. Newer tests have been written using aws-sdk-mock and found in the describe() block
 * that follows. Any updates to these tests should translate dynalite tests to aws-sdk-mocks and new tests should use
 * aws-sdk-mock.
 */
describe('Tests using dynalite', () => {
  const SUFFIX = randomBytes(8).toString('hex');
  const GOOD_TABLE_NAME = `RFDKTestGood-${SUFFIX}`;
  const BAD_TABLE1_NAME = `RFDKTestBad1-${SUFFIX}`; // Missing the sort key
  const BAD_TABLE2_NAME = `RFDKTestBad2-${SUFFIX}`; // Incorrect type on primary key
  const BAD_TABLE3_NAME = `RFDKTestBad3-${SUFFIX}`; // Incorrect type on sort key
  const dynaliteServer = dynalite({
    createTableMs: 5,
    deleteTableMs: 5,
    updateTableMs: 5,
  });
  let dynamoClient: DynamoDBClient;

  beforeAll(async () => {
    const dynaPort = 43266;
    await dynaliteServer.listen(dynaPort, (err: any) => {
      if (err) { throw err; }
    });

    dynamoClient = new DynamoDBClient({
      credentials: {
        accessKeyId: '',
        secretAccessKey: '',
      },
      endpoint: `http://localhost:${dynaPort}`,
      region: 'us-west-2',
    });

    function createTableRequest(tableName: string, primaryKeyType: ScalarAttributeType, sortKeyType?: ScalarAttributeType): CreateTableInput {
      const request: CreateTableInput = {
        TableName: tableName,
        AttributeDefinitions: [
          {
            AttributeName: 'PrimKey',
            AttributeType: primaryKeyType,
          },
        ],
        KeySchema: [
          {
            AttributeName: 'PrimKey',
            KeyType: 'HASH',
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        Tags: [
          {
            Key: 'RFDKTesting',
            Value: 'RFDKTesting',
          },
        ],
      };
      if (sortKeyType) {
        request.AttributeDefinitions!.push({
          AttributeName: 'SortKey',
          AttributeType: sortKeyType,
        });
        request.KeySchema!.push({
          AttributeName: 'SortKey',
          KeyType: 'RANGE',
        });
      }
      return request;
    }

    let request = createTableRequest(GOOD_TABLE_NAME, 'S', 'S');
    let response: CreateTableCommandOutput = await dynamoClient.send(new CreateTableCommand(request));
    let table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${GOOD_TABLE_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE1_NAME, 'S');
    response = await dynamoClient.send(new CreateTableCommand(request));
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE1_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE2_NAME, 'N', 'S');
    response = await dynamoClient.send(new CreateTableCommand(request));
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE2_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE3_NAME, 'S', 'N');
    response = await dynamoClient.send(new CreateTableCommand(request));
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE3_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    let waiting: boolean = true;
    do {
      const promises = [];
      for (const name of [GOOD_TABLE_NAME, BAD_TABLE1_NAME, BAD_TABLE2_NAME, BAD_TABLE3_NAME]) {
        promises.push(dynamoClient.send(new DescribeTableCommand({
          TableName: name,
        })));
      }
      const responses = await Promise.all(promises);
      waiting = !responses.every(item => item.Table?.TableStatus === 'ACTIVE');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } while (waiting);
  }, 60000);

  afterAll(async () => {
    await dynaliteServer.close();
  });

  test('delete table ResourceNotFoundException', async () => {
    const tableName: string = 'NonExistantTable';
    const pk: string = 'PrimKey';
    const sk: string = 'SortKey';

    const table = new TestTable(
      dynamoClient,
      tableName,
      pk,
      sk,
    );
    expect(table.tableName).toBeDefined();
    await expect(table.deleteTable()).resolves.not.toThrow();
    expect(table.tableName).toBeUndefined();
  });

  describe('fromExisting fails on bad table name', () => {
    test.each([
      [BAD_TABLE1_NAME],
      [BAD_TABLE2_NAME],
      [BAD_TABLE3_NAME],
    ])('tableName = %p', async (tableName: string) => {
      // WHEN
      await expect(CompositeStringIndexTable.fromExisting(dynamoClient, tableName))
        // THEN
        .rejects
        .toThrow();
    });
  });

  test('fromExising succeeds on good table name', async () => {
    // WHEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // THEN
    expect(table.primaryKey).toBe('PrimKey');
    expect(table.sortKey).toBe('SortKey');
  });

  test('putItem/getItem success', async () => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const attributes = {
      TestAttribute: 'test value',
    };
    const putRequest = {
      primaryKeyValue: randomBytes(24).toString('hex'),
      sortKeyValue: randomBytes(24).toString('hex'),
      attributes,
    };
    const getRequest = {
      primaryKeyValue: putRequest.primaryKeyValue,
      sortKeyValue: putRequest.sortKeyValue,
    };

    // THEN
    await expect(table.putItem(putRequest)).resolves.toBe(true);
    await expect(table.getItem(getRequest)).resolves.toMatchObject(attributes);
  });

  test.each([
    [true], [false],
  ])('putItem overwrite %p', async (allowOverwrite: boolean) => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const putRequest = {
      primaryKeyValue: randomBytes(24).toString('hex'),
      sortKeyValue: randomBytes(24).toString('hex'),
      attributes: {
        TestAttribute: 'test value',
      },
      allow_overwrite: true,
    };
    await table.putItem(putRequest);

    // THEN
    putRequest.allow_overwrite = allowOverwrite;
    await expect(table.putItem(putRequest)).resolves.toBe(allowOverwrite);
  });

  test('getItem no match', async () => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const getRequest = {
      primaryKeyValue: randomBytes(24).toString('hex'),
      sortKeyValue: randomBytes(24).toString('hex'),
    };

    // THEN
    await expect(table.getItem(getRequest)).resolves.toBeUndefined();
  });

  test('deleteItem success', async () => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const attributes = {
      TestAttribute: 'test value',
    };
    const putRequest = {
      primaryKeyValue: randomBytes(24).toString('hex'),
      sortKeyValue: randomBytes(24).toString('hex'),
      attributes,
    };
    const deleteRequest = {
      primaryKeyValue: putRequest.primaryKeyValue,
      sortKeyValue: putRequest.sortKeyValue,
    };
    await table.putItem(putRequest);

    // THEN
    await expect(table.deleteItem(deleteRequest)).resolves.toBe(true);
  });

  test('deleteItem no match', async () => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const deleteRequest = {
      primaryKeyValue: randomBytes(24).toString('hex'),
      sortKeyValue: randomBytes(24).toString('hex'),
    };

    // THEN
    await expect(table.deleteItem(deleteRequest)).resolves.toBe(false);
  });

  test('query success', async () => {
    // GIVEN
    const table = await CompositeStringIndexTable.fromExisting(dynamoClient, GOOD_TABLE_NAME);

    // WHEN
    const primaryKeyValue: string = randomBytes(24).toString('hex');
    const expected: { [key: string]: { [key: string]: any } } = {};
    for (let i = 0; i < 20; i++) {
      const sortKeyValue: string = randomBytes(24).toString('hex');
      expected[sortKeyValue] = {
        TestAttribute: `value${i}`,
      };
    }
    for (const [key, value] of Object.entries(expected)) {
      const putRequest = {
        primaryKeyValue,
        sortKeyValue: key,
        attributes: value,
      };
      await table.putItem(putRequest);
    }

    // THEN
    await expect(table.query(primaryKeyValue, 5)).resolves.toMatchObject(expected);
  });
});

describe('Tests using aws-sdk-mock', () => {
  let ddbMock: AwsClientStub<DynamoDBClient>;

  beforeAll(() => {
    ddbMock = mockClient(DynamoDBClient);
  });

  afterEach(() => {
    ddbMock.reset();
  });

  afterAll(() => {
    ddbMock.restore();
  });

  describe('fromExisting tests', () => {
    test('Table not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({ Table: undefined });
      const client = new DynamoDBClient();
      const tableName = 'Nonexistant';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow(`Could not describeTable for Table '${tableName}'`);
    });

    test('KeySchema not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({ Table: { KeySchema: undefined } });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow(`Could not get KeySchema for Table '${tableName}'`);
    });

    test('AttributeDefinitions not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({
        Table: {
          KeySchema: [],
          AttributeDefinitions: undefined,
        },
      });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow(`Could not get Attributes for Table '${tableName}'`);
    });

    test('PrimaryKey not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'SortKey',
              KeyType: 'RANGE',
            },
          ],
          AttributeDefinitions: [],
        },
      });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow(`Could not find PrimaryKey of Table '${tableName}'`);
    });

    test('SortKey not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'PrimaryKey',
              KeyType: 'HASH',
            },
          ],
          AttributeDefinitions: [],
        },
      });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow(`Could not find SortKey of Table '${tableName}'`);
    });

    test('PrimaryKey AttributeDefinition not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'PrimaryKey',
              KeyType: 'HASH',
            },
            {
              AttributeName: 'SortKey',
              KeyType: 'RANGE',
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: 'SortKey',
              AttributeType: 'S',
            },
          ],
        },
      });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow("Primary key 'PrimaryKey' must be string type");
    });

    test('SortKey AttributeDefinition not found', async () => {
      ddbMock.on(DescribeTableCommand).resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'PrimaryKey',
              KeyType: 'HASH',
            },
            {
              AttributeName: 'SortKey',
              KeyType: 'RANGE',
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: 'PrimaryKey',
              AttributeType: 'S',
            },
          ],
        },
      });
      const client = new DynamoDBClient();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrow("Sort key 'SortKey' must be string type");
    });
  });

  describe('createNew tests', () => {
    test('DynamoDB.createTable() failure throws Error', async () => {
      ddbMock.on(CreateTableCommand).rejects({});
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';

      await expect(CompositeStringIndexTable.createNew({
        client,
        name,
        primaryKeyName,
        sortKeyName,
      }))
        .rejects
        .toThrow();
    });

    test('success', async () => {
      const tableName: string = 'TestTable';
      const pk: string = 'PrimKey';
      const sk: string = 'SortKey';
      const tags = [
        {
          Key: 'RFDKTesting',
          Value: 'RFDKTesting',
        },
      ];

      ddbMock.on(CreateTableCommand).resolves({});
      const client = new DynamoDBClient();
      const table = await CompositeStringIndexTable.createNew({
        client,
        name: tableName,
        primaryKeyName: pk,
        sortKeyName: sk,
        tags,
      });

      expect(table.primaryKey).toBe(pk);
      expect(table.sortKey).toBe(sk);
    });
  });

  describe('deleteTable tests', () => {
    test('success', async () => {
      const tableName: string = 'TestTable';
      const pk: string = 'PrimKey';
      const sk: string = 'SortKey';
      ddbMock.on(DeleteTableCommand).resolves({});

      const client = new DynamoDBClient();
      const table = new TestTable(
        client,
        tableName,
        pk,
        sk,
      );

      await expect(table.deleteTable()).resolves.not.toThrow();
    });

    test('Table already deleted', async () => {
      ddbMock.on(DeleteTableCommand).resolves({});
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await subject.deleteTable();

      await expect(subject.deleteTable()).resolves.toBe(undefined);
      expect(ddbMock).toHaveReceivedCommandTimes(DeleteTableCommand, 1);
    });

    test('DynamoDB.deleteTable() failure', async () => {
      ddbMock.on(DeleteTableCommand).rejects(new Error());
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.deleteTable()).rejects.toThrow();
    });
  });

  describe('putItem tests', () => {
    test('Table already deleted', async () => {
      ddbMock.on(DeleteTableCommand).resolves({});
      ddbMock.on(PutItemCommand).resolves({});

      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await subject.deleteTable();

      await expect(subject.putItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' }))
        .rejects
        .toThrow('Attempt to PutItem in deleted table');
      expect(ddbMock).toHaveReceivedCommandTimes(DeleteTableCommand, 1);
      expect(ddbMock).not.toHaveReceivedCommand(PutItemCommand);
    });

    test('DynamoDB.putItem() failure', async () => {
      ddbMock.on(PutItemCommand).rejects(new Error());
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.putItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrow();
    });
  });

  describe('getItem tests', () => {
    test('Table already deleted', async () => {
      ddbMock.on(DeleteTableCommand).resolves({});
      ddbMock.on(GetItemCommand).resolves({});

      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await subject.deleteTable();

      await expect(subject.getItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' }))
        .rejects
        .toThrow('Attempt to GetItem from deleted table');
      expect(ddbMock).toHaveReceivedCommandTimes(DeleteTableCommand, 1);
      expect(ddbMock).not.toHaveReceivedCommand(GetItemCommand);
    });

    test('DynamoDB.getItem() failure', async () => {
      ddbMock.on(GetItemCommand).rejects(new Error());
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.getItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrow();
    });
  });

  describe('deleteItem tests', () => {
    test('Table already deleted', async () => {
      ddbMock.on(DeleteTableCommand).resolves({});
      ddbMock.on(DeleteItemCommand).resolves({});

      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await subject.deleteTable();

      await expect(subject.deleteItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' }))
        .rejects
        .toThrow('Attempt to DeleteItem from deleted table');
      expect(ddbMock).toHaveReceivedCommandTimes(DeleteTableCommand, 1);
      expect(ddbMock).not.toHaveReceivedCommand(DeleteItemCommand);
    });

    test('DynamoDB.deleteItem() failure', async () => {
      ddbMock.on(DeleteItemCommand).rejects(new Error());
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.deleteItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrow();
    });
  });

  describe('query tests', () => {
    test('Returns empty', async () => {
      ddbMock.on(QueryCommand).resolves({});

      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );

      await expect(subject.query('TestPrimVal'))
        .resolves
        .toEqual({});
      expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    test('Table already deleted', async () => {
      ddbMock.on(DeleteTableCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({});

      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await subject.deleteTable();

      await expect(subject.query('TestPrimVal'))
        .rejects
        .toThrow('Attempt to Query a deleted table');
      expect(ddbMock).toHaveReceivedCommandTimes(DeleteTableCommand, 1);
      expect(ddbMock).not.toHaveReceivedCommand(QueryCommand);
    });

    test('DynamoDB.query() failure', async () => {
      ddbMock.on(QueryCommand).rejects(new Error());
      const client = new DynamoDBClient();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.query('TestPrimVal')).rejects.toThrow();
    });
  });
});
