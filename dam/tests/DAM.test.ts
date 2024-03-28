import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';
import {
  AbstractClient,
  type ClientOptions,
  DAM,
  DAMConfigError,
  PostgresClient,
} from '../mod.ts';
import { envArgs } from '../../utils/envArgs.ts';
const envData = envArgs('dam/tests');

describe('DAM', () => {
  describe('ConnectionManager', () => {
    it('should add a configuration', () => {
      DAM.addConfig('test', { dialect: 'POSTGRES' });
      assertEquals(DAM.hasConfig('test'), true);
    });

    it('should throw an error when adding an invalid configuration', () => {
      assertThrows(() => {
        DAM.addConfig(
          'test2',
          JSON.parse(JSON.stringify({ dialect: 'INVALID' })),
        );
      }, DAMConfigError);
    });

    it('should throw an error when adding an existing configuration', () => {
      assertThrows(() => {
        DAM.addConfig('test', { dialect: 'POSTGRES' });
      }, DAMConfigError);
    });

    it('should check if a configuration exists', () => {
      assertEquals(DAM.hasConfig('test'), true);
      assertEquals(DAM.hasConfig('nonExistent'), false);
    });

    it('should retrieve a client instance', () => {
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

    it('should throw an error when retrieving a non-existent client', () => {
      assertThrows(() => {
        DAM.getClient('nonExistent');
      }, DAMConfigError);
    });

    it('should register a client', () => {
      const client = new PostgresClient('pgtest', {
        dialect: 'POSTGRES',
        host: envData.get('PG_HOST') || 'localhost',
        username: envData.get('PG_USER') || 'postgres',
        password: envData.get('PG_PASS') || 'postgres',
        port: parseInt(envData.get('PG_PORT')) || 5432,
        database: envData.get('PG_DB') || 'postgres',
        poolSize: 1,
      });

      assertEquals(
        DAM.getClient('pgtest'),
        client as unknown as AbstractClient<ClientOptions>,
      );
      client.close();
    });

    it('simple test for other dialects', () => {
      DAM.addConfig('mongo', { dialect: 'MONGO' });
      DAM.addConfig('sqlite', { dialect: 'SQLITE' });
      DAM.addConfig('maria', { dialect: 'MARIA' });

      assertEquals(DAM.hasConfig('mongo'), true);
      assertEquals(DAM.hasConfig('sqlite'), true);
      assertEquals(DAM.hasConfig('maria'), true);
    });
  });
});
