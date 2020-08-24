/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

// eslint-disable-next-line import/no-extraneous-dependencies
import { randomBytes } from 'crypto';
import * as AWS from 'aws-sdk';
import { mock, restore, setSDKInstance } from 'aws-sdk-mock';
import * as dynalite from 'dynalite';
import { fake } from 'sinon';

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
    client: AWS.DynamoDB,
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
  let dynamoClient: AWS.DynamoDB;

  beforeAll(async () => {
    const dynaPort = 43266;
    await dynaliteServer.listen(dynaPort, (err: any) => {
      if (err) { throw err; }
    });

    dynamoClient = new AWS.DynamoDB({
      credentials: new AWS.Credentials({
        accessKeyId: '',
        secretAccessKey: '',
      }),
      endpoint: `http://localhost:${dynaPort}`,
      region: 'us-west-2',
    });

    function createTableRequest(tableName: string, primaryKeyType: string, sortKey?: { KeyType: string }): AWS.DynamoDB.CreateTableInput {
      const request = {
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
      if (sortKey) {
        request.AttributeDefinitions.push({
          AttributeName: 'SortKey',
          AttributeType: sortKey.KeyType,
        });
        request.KeySchema.push({
          AttributeName: 'SortKey',
          KeyType: 'RANGE',
        });
      }
      return request;
    }

    let request = createTableRequest(GOOD_TABLE_NAME, 'S', { KeyType: 'S' });
    let response: AWS.DynamoDB.CreateTableOutput = await dynamoClient.createTable(request).promise();
    let table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${GOOD_TABLE_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE1_NAME, 'S');
    response = await dynamoClient.createTable(request).promise();
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE1_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE2_NAME, 'N', { KeyType: 'S' });
    response = await dynamoClient.createTable(request).promise();
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE2_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    request = createTableRequest(BAD_TABLE3_NAME, 'S', { KeyType: 'N' });
    response = await dynamoClient.createTable(request).promise();
    table = response.TableDescription;
    if (!table) { throw Error(`Could not create ${BAD_TABLE3_NAME}`); }
    console.debug(`Created DynamoDB table: '${table.TableName}'`);

    let waiting: boolean = true;
    do {
      const promises = [];
      for (const name of [GOOD_TABLE_NAME, BAD_TABLE1_NAME, BAD_TABLE2_NAME, BAD_TABLE3_NAME]) {
        promises.push(dynamoClient.describeTable({
          TableName: name,
        }).promise());
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
    await expect(table.deleteTable()).resolves.not.toThrowError();
    expect(table.tableName).toBeUndefined();
  });

  test.each([
    [GOOD_TABLE_NAME, false],
    [BAD_TABLE1_NAME, true],
    [BAD_TABLE2_NAME, true],
    [BAD_TABLE3_NAME, true],
  ])('fromExisting table %p', async (tableName: string, expectedToThrow: boolean) => {

    if (expectedToThrow) {
      await expect(CompositeStringIndexTable.fromExisting(dynamoClient, tableName)).rejects.toThrow();
    } else {
      await expect(CompositeStringIndexTable.fromExisting(dynamoClient, tableName)).resolves.not.toThrow();
      const table = await CompositeStringIndexTable.fromExisting(dynamoClient, tableName);
      expect(table.primaryKey).toBe('PrimKey');
      expect(table.sortKey).toBe('SortKey');
    }
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
  beforeEach(() => {
    setSDKInstance(AWS);
  });

  afterEach(() => {
    restore('DynamoDB');
  });

  describe('fromExisting tests', () => {
    test('Table not found', async () => {
      const callback = fake.resolves({ Table: undefined });
      mock('DynamoDB', 'describeTable', callback);
      const client = new AWS.DynamoDB();
      const tableName = 'Nonexistant';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError(`Could not describeTable for Table '${tableName}'`);
    });

    test('KeySchema not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({ Table: { KeySchema: undefined } }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError(`Could not get KeySchema for Table '${tableName}'`);
    });

    test('AttributeDefinitions not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({
        Table: {
          KeySchema: [],
          AttributeDefinitions: undefined,
        },
      }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError(`Could not get Attributes for Table '${tableName}'`);
    });

    test('PrimaryKey not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'SortKey',
              KeyType: 'RANGE',
            },
          ],
          AttributeDefinitions: {},
        },
      }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError(`Could not find PrimaryKey of Table '${tableName}'`);
    });

    test('SortKey not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({
        Table: {
          KeySchema: [
            {
              AttributeName: 'PrimaryKey',
              KeyType: 'HASH',
            },
          ],
          AttributeDefinitions: {},
        },
      }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError(`Could not find SortKey of Table '${tableName}'`);
    });

    test('PrimaryKey AttributeDefinition not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({
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
      }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError("Primary key 'PrimaryKey' must be string type");
    });

    test('SortKey AttributeDefinition not found', async () => {
      mock('DynamoDB', 'describeTable', fake.resolves({
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
      }));
      const client = new AWS.DynamoDB();
      const tableName = 'TestTable';

      await expect(CompositeStringIndexTable.fromExisting(client, tableName))
        .rejects
        .toThrowError("Sort key 'SortKey' must be string type");
    });
  });

  describe('createNew tests', () => {
    test('DynamoDB.createTable() failure throws Error', async () => {
      mock('DynamoDB', 'createTable', fake.rejects({}));
      const client = new AWS.DynamoDB();
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

      mock('DynamoDB', 'createTable', fake.resolves({}));
      const client = new AWS.DynamoDB();
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
      mock('DynamoDB', 'deleteTable', fake.resolves({}));

      const client = new AWS.DynamoDB();
      const table = new TestTable(
        client,
        tableName,
        pk,
        sk,
      );

      await expect(table.deleteTable()).resolves.not.toThrow();
    });

    test('Table already deleted', async () => {
      const deleteFake = fake.resolves({});
      mock('DynamoDB', 'deleteTable', deleteFake);
      const client = new AWS.DynamoDB();
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
      expect(deleteFake.callCount).toEqual(1);
    });

    test('DynamoDB.deleteTable() failure', async () => {
      mock('DynamoDB', 'deleteTable', fake.rejects(new Error()));
      const client = new AWS.DynamoDB();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.deleteTable()).rejects.toThrowError();
    });
  });

  describe('putItem tests', () => {
    test('Table already deleted', async () => {
      const deleteFake = fake.resolves({});
      mock('DynamoDB', 'deleteTable', deleteFake);
      const putFake = fake.resolves({});
      mock('DynamoDB', 'putItem', putFake);

      const client = new AWS.DynamoDB();
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
        .toThrowError('Attempt to PutItem in deleted table');
      expect(deleteFake.callCount).toEqual(1);
      expect(putFake.notCalled).toBeTruthy();
    });

    test('DynamoDB.putItem() failure', async () => {
      mock('DynamoDB', 'putItem', fake.rejects(new Error()));
      const client = new AWS.DynamoDB();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.putItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrowError();
    });
  });

  describe('getItem tests', () => {
    test('Table already deleted', async () => {
      const deleteFake = fake.resolves({});
      mock('DynamoDB', 'deleteTable', deleteFake);
      const getFake = fake.resolves({});
      mock('DynamoDB', 'getItem', getFake);

      const client = new AWS.DynamoDB();
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
        .toThrowError('Attempt to GetItem from deleted table');
      expect(deleteFake.callCount).toEqual(1);
      expect(getFake.notCalled).toBeTruthy();
    });

    test('DynamoDB.getItem() failure', async () => {
      mock('DynamoDB', 'getItem', fake.rejects(new Error()));
      const client = new AWS.DynamoDB();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.getItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrowError();
    });
  });

  describe('deleteItem tests', () => {
    test('Table already deleted', async () => {
      const deleteTableFake = fake.resolves({});
      mock('DynamoDB', 'deleteTable', deleteTableFake);
      const deleteItemFake = fake.resolves({});
      mock('DynamoDB', 'deleteItem', deleteItemFake);

      const client = new AWS.DynamoDB();
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
        .toThrowError('Attempt to DeleteItem from deleted table');
      expect(deleteTableFake.callCount).toEqual(1);
      expect(deleteItemFake.notCalled).toBeTruthy();
    });

    test('DynamoDB.deleteItem() failure', async () => {
      mock('DynamoDB', 'deleteItem', fake.rejects(new Error()));
      const client = new AWS.DynamoDB();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.deleteItem({ primaryKeyValue: 'TestPrimVal', sortKeyValue: 'TestSortVal' })).rejects.toThrowError();
    });
  });

  describe('query tests', () => {
    test('Returns empty', async () => {
      const queryFake = fake.resolves({});
      mock('DynamoDB', 'query', queryFake);

      const client = new AWS.DynamoDB();
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
      expect(queryFake.callCount).toEqual(1);
    });

    test('Table already deleted', async () => {
      const deleteTableFake = fake.resolves({});
      mock('DynamoDB', 'deleteTable', deleteTableFake);
      const queryFake = fake.resolves({});
      mock('DynamoDB', 'query', queryFake);

      const client = new AWS.DynamoDB();
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
        .toThrowError('Attempt to Query a deleted table');
      expect(deleteTableFake.callCount).toEqual(1);
      expect(queryFake.notCalled).toBeTruthy();
    });

    test('DynamoDB.query() failure', async () => {
      mock('DynamoDB', 'query', fake.rejects(new Error()));
      const client = new AWS.DynamoDB();
      const name = 'TestTable';
      const primaryKeyName = 'PrimaryKey';
      const sortKeyName = 'SortKey';
      const subject = new TestTable(
        client,
        name,
        primaryKeyName,
        sortKeyName,
      );
      await expect(subject.query('TestPrimVal')).rejects.toThrowError();
    });
  });
});
