import {
  afterEach,
  assertEquals,
  assertThrows,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';
import { MariaClient } from '../dialects/mod.ts';
import type { MariaConnectionOptions } from '../types/mod.ts';
import {
  // NormBaseError,
  NormConfigError,
  // NormQueryError,
} from '../errors/mod.ts';

describe(`[library='norm' dialect='MARIA' type='unit']`, () => {
  let client: MariaClient;
  const clientOpt: MariaConnectionOptions = {
    dialect: 'MARIA',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'mariapw',
    database: 'mysql',
    poolSize: 10,
  };
  const tableName = 'test_' + Math.floor(Math.random() * 1000000);
  const createTableQuery =
    `CREATE TABLE IF NOT EXISTS ${tableName} (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255));`;
  const insertQuery =
    `INSERT INTO ${tableName} (name, email) VALUES ('John Doe', 'john.dow@gmail.com') RETURNING id, name, email;`;
  const selectQuery = `SELECT * FROM ${tableName};`;
  const selectQuery1 = `SELECT * FROM ${tableName} WHERE id = :id:;`;
  const selectQuery2 = `SELECT * FROM ${tableName} WHERE id = 10;`;
  // const selectQuery3 = `SELECT * FROM ${tableName} WHERE abc = 10;`;
  const dropTableQuery = `DROP TABLE IF EXISTS ${tableName};`;

  beforeEach(() => {
    client = new MariaClient('test', clientOpt);
  });

  afterEach(async () => {
    await client.close();
  });

  it('should throw error if invalid dialect passed', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'POSTGRES',
        host: 'localhost',
        password: 'mariapw',
        database: 'mysql',
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt);
    }, NormConfigError);
  });

  it('should throw error if invalid port passed', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
        database: 'mysql',
        port: -1,
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt);
    }, NormConfigError);
    const opt2 = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
        database: 'mysql',
        port: 888888,
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt2);
    }, NormConfigError);
  });

  it('should throw error if poolSize < 0 or greater than 100', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
        database: 'mysql',
        poolSize: -1,
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt);
    }, NormConfigError);
    const opt2 = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
        database: 'mysql',
        poolSize: 888888,
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt2);
    }, NormConfigError);
  });

  it('should throw error if invalid database value', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt);
    }, NormConfigError);
    const opt2 = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: 'localhost',
        password: 'mariapw',
        database: '',
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt2);
    }, NormConfigError);
  });

  it('should throw error if invalid host', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        password: 'mariapw',
        database: 'mysql',
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt);
    }, NormConfigError);
    const opt2 = JSON.parse(
      JSON.stringify({
        dialect: 'MARIA',
        host: ' ',
        password: 'mariapw',
        database: 'mysql',
      }),
    );
    assertThrows(() => {
      new MariaClient('FailTest', opt2);
    }, NormConfigError);
  });

  it('should connect', async () => {
    await client.connect();
    assertEquals(client.status, 'CONNECTED');
  });

  it('should create table', async () => {
    const res = await client.execute(createTableQuery);
    assertEquals(res.type, 'CREATE');
  });

  it('should insert record', async () => {
    const res = await client.query(insertQuery);
    assertEquals(res.count, 1);
    assertEquals(res.data[0].id, 1);
    assertEquals(res.data[0].name, 'John Doe');
    assertEquals(res.data[0].email, 'john.dow@gmail.com');
    assertEquals(res.type, 'INSERT');
  });

  it('should query record', async () => {
    const res = await client.query(selectQuery);
    assertEquals(res.count, 1);
    assertEquals(res.count, res.data.length);
    assertEquals(res.data[0].id, 1);
    assertEquals(res.data[0].name, 'John Doe');
    const res1 = await client.query(selectQuery1, { id: 1 });
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
