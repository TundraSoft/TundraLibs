import {
  afterEach,
  assertEquals,
  assertThrows,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';
import { SQLiteClient } from '../Dialetcts/mod.ts';
import type { SQLiteConnectionOptions } from '../types/mod.ts';
import {
  NormBaseError,
  NormConfigError,
  NormQueryError,
} from '../errors/mod.ts';

describe(`[library='norm' dialect='SQLite' type='unit']`, () => {
  let client: SQLiteClient;
  const clientOpt: SQLiteConnectionOptions = {
    dialect: 'SQLITE',
    mode: 'MEMORY',
  };
  const tableName = 'test_' + Math.floor(Math.random() * 1000000);
  const createTableQuery =
    `CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL, email VARCHAR(255));`;
  const insertQuery =
    `INSERT INTO ${tableName} (name, email) VALUES (:name, :email) RETURNING id, name, email;`;
  const insertBulkQuery =
    `INSERT INTO ${tableName} (name, email) VALUES (:name, :email) RETURNING id, name, email;`;
  const selectQuery = `SELECT * FROM ${tableName};`;
  const selectQuery1 = `SELECT * FROM ${tableName} WHERE id = 1;`;
  const selectQuery2 = `SELECT * FROM ${tableName} WHERE id = 10;`;
  const selectQuery3 = `SELECT * FROM ${tableName} WHERE abc = 10;`;
  const dropTableQuery = `DROP TABLE IF EXISTS ${tableName};`;

  beforeEach(() => {
    client = new SQLiteClient('test', clientOpt);
  });

  afterEach(async () => {
    await client.close();
  });

  it('should throw error if invalid dialect passed', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'POSTGRES',
        mode: 'MEMORY',
      }),
    );
    assertThrows(() => {
      new SQLiteClient('FailTest', opt);
    }, NormConfigError);
  });

  it('should throw error if invalid mode is passed', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'SQLITE',
        mode: 'something',
      }),
    );
    assertThrows(() => {
      new SQLiteClient('FailTest', opt);
    }, NormConfigError);
  });

  // it('should throw error file path is not passed in FILE mode', () => {
  //   const opt = JSON.parse(
  //     JSON.stringify({
  //       dialect: 'SQLITE',
  //       mode: 'FILE',
  //       filePath: './tests/testdata/sqlitedb/'
  //     }),
  //   );

  //   assertThrows(() => {
  //     new SQLiteClient('FailTest', opt);
  //   }, NormConfigError);
  //   const opt2 = JSON.parse(
  //     JSON.stringify({
  //       dialect: 'POSTGRES',
  //       host: 'postgres',
  //       password: 'postgres',
  //       database: 'postgres',
  //       poolSize: 888888,
  //     }),
  //   );
  //   assertThrows(() => {
  //     new SQLiteClient('FailTest', opt2);
  //   }, NormConfigError);
  // });

  it('should connect', async () => {
    await client.connect();
    assertEquals(client.status, 'CONNECTED');
  });

  it('should create table', async () => {
    const res = await client.execute(createTableQuery);
    assertEquals(res.type, 'CREATE');
  });

  it('should insert record', async () => {
    await client.execute(createTableQuery);
    const res = await client.query(insertQuery, {
      name: 'John Doe',
      email: 'john.doe@gmail.com',
    });
    assertEquals(res.count, 1);
    assertEquals(res.data[0].id, 1);
    assertEquals(res.data[0].name, 'John Doe');
    assertEquals(res.data[0].email, 'john.doe@gmail.com');
    assertEquals(res.type, 'INSERT');
  });

  it('should query record', async () => {
    await client.execute(createTableQuery);
    await client.query(insertQuery, {
      name: 'John Doe',
      email: 'john.doe@gmail.com',
    });
    const res = await client.query(selectQuery);
    assertEquals(res.count, 1);
    assertEquals(res.count, res.data.length);
    assertEquals(res.data[0].id, 1);
    assertEquals(res.data[0].name, 'John Doe');
    const res1 = await client.query(selectQuery1);
    assertEquals(res1.count, 1);
    const res2 = await client.query(selectQuery2);
    assertEquals(res2.count, 0);
    assertEquals(res2.count, res2.data.length);

    // assertThrows(async () => { try {await client.query(selectQuery3)} catch (err) { throw err } }, Error);
  });

  it('should drop table', async () => {
    const res = await client.execute(dropTableQuery);
    assertEquals(res.type, 'DROP');
  });
});
