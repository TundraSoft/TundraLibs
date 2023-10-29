import {
  afterEach,
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../../dev.dependencies.ts';

import { SQLiteClient } from '../../dialects/mod.ts';

const queries: Record<string, string> = {
  'create':
    'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER NOT NULL);',
  'insertOne': `INSERT INTO test (name, age) VALUES ('John', 25);`,
  'insert': `INSERT INTO test (name, age) VALUES ('Joan', 32), ('Marc', 78);`,
  'select': 'SELECT * FROM test;',
  'selectFilter': `SELECT * FROM test WHERE name = 'John';`,
  'selectNonExistent': 'SELECT * FROM test WHERE name = "NonExistent";',
  'update': 'UPDATE test SET name = "John Doe" WHERE name = "John";',
  'updateAll': 'UPDATE test SET name = "John Doe";',
  'updateNonExistent':
    'UPDATE test SET name = "John Doe" WHERE name = "NonExistent";',
  'delete': 'DELETE FROM test WHERE age = 25;',
  'deleteAll': 'DELETE FROM test;',
  'deleteNonExistent': 'DELETE FROM test WHERE name = "NonExistent";',
  'drop': 'DROP TABLE IF EXISTS test;',
  'dropNonExistent': 'DROP TABLE IF EXISTS NonExistent;',
  'dropDatabase': 'DROP DATABASE IF EXISTS test;',
  'dropDatabaseNonExistent': 'DROP DATABASE IF EXISTS NonExistent;',
};

let db: SQLiteClient;

describe(`[library='norm' mode='SQLite' mode='memory']`, () => {
  beforeEach(async () => {
    // Connect to DB
    db = new SQLiteClient('SQLite-Test', {
      dialect: 'SQLITE',
      type: 'MEMORY',
      mode: 'create',
    });
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('Connect to SQLite', async () => {
    await db.connect();
  });

  it('Create Table in SQLite', async () => {
    await db.query(queries['create']);
  });

  it('Run an Insert statement', async () => {
    await db.query(queries['create']);
    await db.query(queries['insertOne']);
    await db.query(queries['insert']);
  });

  it('Select from table', async () => {
    await db.query(queries['create']);
    await db.query(queries['insertOne']);
    await db.query(queries['insert']);

    const rows = await db.query(queries['select']);
    console.log(rows);
  });

  it('Update record(s) in table', async () => {
    await db.query(queries['create']);
    await db.query(queries['insertOne']);
    await db.query(queries['insert']);

    await db.query(queries['update']);
    await db.query(queries['updateAll']);
  });

  it('Delete record(s) in table', async () => {
    await db.query(queries['delete']);
    await db.query(queries['deleteAll']);
  });

  it('Drop table', async () => {
    await db.query(queries['drop']);
  });

  it('Drop database', async () => {
    await db.query(queries['dropDatabase']);
  });
});
