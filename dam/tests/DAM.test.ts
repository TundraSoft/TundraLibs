import {
  assertEquals,
  assertInstanceOf,
  assertThrows,
} from '../../dev.dependencies.ts';
import {
  DAM,
  DAMError,
  PostgresClient,
  MariaClient, 
  SQLiteClient
} from '../mod.ts';
import { envArgs } from '../../utils/envArgs.ts';
const envData = envArgs('dam/tests');

Deno.test('DAM', async (t) => {
  await t.step('should add a configuration', () => {
    DAM.addConfig('test', { dialect: 'POSTGRES' });
    assertEquals(DAM.hasConfig('test'), true);
  });

  await t.step('should throw an error when adding an invalid configuration', () => {
    assertThrows(() => {
      DAM.addConfig(
        'test2',
        JSON.parse(JSON.stringify({ dialect: 'INVALID' })),
      );
    }, DAMError);
  });

  await t.step('should throw an error when adding an existing configuration', () => {
    assertThrows(() => {
      DAM.addConfig('test', { dialect: 'POSTGRES' });
    }, DAMError);
  });

  await t.step('should check if a configuration exists', () => {
    assertEquals(DAM.hasConfig('test'), true);
    assertEquals(DAM.hasConfig('nonExistent'), false);
  });

  await t.step('should retrieve a client instance', () => {
    DAM.addConfig('realConn', {
      dialect: 'POSTGRES',
      host: envData.get('PG_HOST') || 'localhost',
      username: envData.get('PG_USER') || 'postgres',
      password: envData.get('PG_PASS') || 'postgres',
      port: parseInt(envData.get('PG_PORT')) || 5432,
      database: envData.get('PG_DB') || 'postgres',
      poolSize: 1,
    });

    const client = DAM.getClient('realConn');

    assertEquals(client.name, 'realconn');
  });

  await t.step('should throw an error when retrieving a non-existent client', () => {
    assertThrows(() => {
      DAM.getClient('nonExistent');
    }, DAMError);
  });

  await t.step('should register a PG client', () => {
    DAM.addConfig('pgtest', {
      dialect: 'POSTGRES',
      host: envData.get('PG_HOST') || 'localhost',
      username: envData.get('PG_USER') || 'postgres',
      password: envData.get('PG_PASS') || 'postgres',
      port: parseInt(envData.get('PG_PORT')) || 5432,
      database: envData.get('PG_DB') || 'postgres',
      poolSize: 1,
    });

    assertInstanceOf(
      DAM.getClient('pgtest'),
      PostgresClient,
    );
    DAM.getClient('pgtest').close();
  });

  await t.step('should register a Maria client', () => {
    DAM.addConfig('mariatest', {
      dialect: 'MARIA',
      host: envData.get('PG_HOST') || 'localhost',
      username: envData.get('PG_USER') || 'postgres',
      password: envData.get('PG_PASS') || 'postgres',
      port: parseInt(envData.get('PG_PORT')) || 5432,
      database: envData.get('PG_DB') || 'postgres',
      poolSize: 1,
    });

    assertInstanceOf(
      DAM.getClient('mariatest'),
      MariaClient,
    );
    DAM.getClient('mariatest').close();
  });

  await t.step('should register a SQLite client', () => {
    DAM.addConfig('sqliteclient', {
      dialect: 'SQLITE',
      mode: 'MEMORY', 
    });

    assertInstanceOf(
      DAM.getClient('sqliteclient'),
      SQLiteClient,
    );
    DAM.getClient('sqliteclient').close();
  });

  await t.step('simple test for other dialects', () => {
    DAM.addConfig('mongo', { dialect: 'MONGO' });
    DAM.addConfig('sqlite', { dialect: 'SQLITE' });
    DAM.addConfig('maria', { dialect: 'MARIA' });

    assertEquals(DAM.hasConfig('mongo'), true);
    assertEquals(DAM.hasConfig('sqlite'), true);
    assertEquals(DAM.hasConfig('maria'), true);
  });
});
