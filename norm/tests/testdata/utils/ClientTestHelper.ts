import {
  afterAll,
  afterEach,
  assertEquals,
  assertThrows,
  beforeAll,
  beforeEach,
  it,
} from '../../../../dev.dependencies.ts';
import { envArgs } from '../../../../utils/envArgs.ts';
import {
  ConnectionOptions,
  FlatFileConnectionOptions,
  MariaConnectionOptions,
  PostgresConnectionOptions,
  RemoteServerConnectionOptions,
  SQLiteConnectionOptions,
} from '../../../types/mod.ts';
import { NormConfigError } from '../../../errors/mod.ts';
import { AbstractClient } from '../../../AbstractConnection.ts';

const envData = envArgs('norm/tests/testdata');

export const makeSQLiteMemoryOptions = () => {
  const clientOpt: SQLiteConnectionOptions = {
    dialect: 'SQLITE',
    mode: 'MEMORY',
  };
  return clientOpt;
};

export const makeSQLiteFileOptions = () => {
  const clientOpt: SQLiteConnectionOptions = {
    dialect: 'SQLITE',
    mode: 'FILE',
    filePath: 'norm/tests/testdata/test.db',
  };
  return clientOpt;
};

export const makePostgresOptions = () => {
  const clientOpt: PostgresConnectionOptions = {
    dialect: 'POSTGRES',
    host: envData.get('POSTGRES_HOST') || 'localhost',
    username: envData.get('POSTGRES_USER') || 'postgres',
    password: envData.get('POSTGRES_PASSWORD') || 'postgres',
    database: envData.get('POSTGRES_DATABASE') || 'postgres',
    port: parseInt(envData.get('POSTGRES_PORT') || '5432'),
  };
  return clientOpt;
};

export const makeMariaOptions = () => {
  const clientOpt: MariaConnectionOptions = {
    dialect: 'MARIA',
    host: envData.get('MARIADB_HOST') || 'localhost',
    username: envData.get('MARIADB_USER') || 'root',
    password: envData.get('MARIADB_PASSWORD') || 'maria',
    database: envData.get('MARIADB_DATABASE') || 'mysql',
    port: parseInt(envData.get('MARIADB_PORT') || '3306'),
  };
  return clientOpt;
};

function makeRDBMSFlatFileConnectionTests(
  opts: FlatFileConnectionOptions,
): Record<string, string[]> {
  return {
    'should throw error if invalid dialect passed': [
      JSON.stringify({
        dialect: 'POSTGRES',
        mode: opts.mode,
      }),
    ],
    'should throw error if invalid mode is passed': [
      JSON.stringify({
        dialect: opts.dialect,
        mode: 'something',
      }),
    ],
    'should throw error if mode is FILE and no filePath is passed': [
      JSON.stringify({
        dialect: opts.dialect,
        mode: 'FILE',
      }),
    ],
  };
}

function makeRDBMSRemoteConnectionTests(
  opts: RemoteServerConnectionOptions,
): Record<string, string[]> {
  return {
    'should throw error if invalid dialect passed': [
      JSON.stringify({
        dialect: 'SomeInvalidDialect',
        host: opts.host,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: opts.port,
      }),
    ],
    'should throw error if invalid port passed': [
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: -1,
      }),
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: 888888,
      }),
    ],
    'should throw error if invalid database value': [
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        port: opts.port,
      }),
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        port: opts.port,
        database: '',
      }),
    ],
    'should throw error if invalid host': [
      JSON.stringify({
        dialect: opts.dialect,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: opts.port,
      }),
      JSON.stringify({
        dialect: opts.dialect,
        host: '',
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: opts.port,
      }),
    ],
    'should throw error if poolSize < 0 or greater than 100': [
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: opts.port,
        poolSize: -1,
      }),
      JSON.stringify({
        dialect: opts.dialect,
        host: opts.host,
        username: opts.username,
        password: opts.password,
        database: opts.database,
        port: opts.port,
        poolSize: 88888888,
      }),
    ],
  };
}

function clientFactory<
  CO extends ConnectionOptions,
  C extends AbstractClient<CO>,
>(type: { new (name: string, opts: CO): C }, name: string, opts: CO): C {
  return new type(name, opts);
}

export function runStandardConnectionTests<
  CO extends ConnectionOptions,
  C extends AbstractClient<CO>,
>(
  clientClass: { new (name: string, opts: CO): C },
  clientOpt: CO,
  stdConnTestConfig: Record<string, string[]>,
) {
  for (const testName in stdConnTestConfig) {
    const record = stdConnTestConfig[testName];
    it(testName, () => {
      for (const item of record) {
        assertThrows(() => {
          clientFactory(
            clientClass,
            'FailTest',
            JSON.parse(item),
          );
        }, NormConfigError);
      }
    });
  }
  const client = clientFactory(
    clientClass,
    'ConnectTest',
    clientOpt,
  );
  it('should connect', async () => {
    await client.connect();
    assertEquals(client.status, 'CONNECTED');
    await client.close();
  });
}

export function runStandardFlatFileConnectionTests<
  CO extends FlatFileConnectionOptions,
  C extends AbstractClient<CO>,
>(
  clientClass: { new (name: string, opts: CO): C },
  clientOpt: CO,
) {
  runStandardConnectionTests(
    clientClass,
    clientOpt,
    makeRDBMSFlatFileConnectionTests(clientOpt),
  );
}

export function runStandardRemoteConnectionTests<
  CO extends RemoteServerConnectionOptions,
  C extends AbstractClient<CO>,
>(
  clientClass: { new (name: string, opts: CO): C },
  clientOpt: CO,
) {
  runStandardConnectionTests(
    clientClass,
    clientOpt,
    makeRDBMSRemoteConnectionTests(clientOpt),
  );
}

export function runStandardQueryTests<
  CO extends ConnectionOptions,
  C extends AbstractClient<CO>,
>(
  clientClass: { new (name: string, opts: CO): C },
  clientOpt: CO,
  hasSerial = true,
  isMemory = false,
) {
  let client: C;

  beforeAll(async () => {
    if (isMemory) {
      client = clientFactory(
        clientClass,
        'QueryTest',
        clientOpt,
      );
      await client.connect();
    }
  });

  beforeEach(() => {
    if (!isMemory) {
      client = clientFactory(
        clientClass,
        'ConnectTest',
        clientOpt,
      );
    }
  });

  afterEach(async () => {
    if (!isMemory) {
      await client.close();
    }
  });

  afterAll(async () => {
    if (isMemory) {
      await client.close();
    }
  });

  const tableName = 'test_' + Math.floor(Math.random() * 1000000);
  const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (id ${
    hasSerial ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'
  }, name VARCHAR(255) NOT NULL, email VARCHAR(255));`;
  const insertQuery =
    `INSERT INTO ${tableName} (name, email) VALUES ('John Doe', 'john.dow@gmail.com') RETURNING id, name, email;`;
  const selectQuery = `SELECT * FROM ${tableName};`;
  const selectQuery1 = `SELECT * FROM ${tableName} WHERE id = 1;`;
  const selectQuery2 = `SELECT * FROM ${tableName} WHERE id = 10;`;
  // const selectQuery3 = `SELECT * FROM ${tableName} WHERE abc = 10;`;
  const dropTableQuery = `DROP TABLE IF EXISTS ${tableName};`;
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
}
