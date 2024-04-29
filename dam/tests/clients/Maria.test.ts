import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../../dev.dependencies.ts';

import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMConfigError,
  DAMMissingParams,
  MariaClient,
  DAMQueryError, 
  type MariaOptions,
  DAMConnectionError
} from '../../mod.ts';

const envData = envArgs('dam/tests');

Deno.test({ name: 'DAM:Client:Maria', sanitizeOps: false, sanitizeResources: false }, async (t) => {

  await t.step('Invalid Config', async (t) => {
    await t.step('Incorrect/Missing Dialect', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIAS',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
      
      assertThrows(() => {
        const conf = {
          dialect: '',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Missing Host', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: '',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Missing/Incorrect port', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: 65534323,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: 1,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Username Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          // username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: '',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Invalid Password', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          // password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
        console.log('sdfgsdfsdfsdf')
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: '',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Database Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          // database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: '',
          poolSize: 1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Invalid/Incorrect PoolSize', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: -1,
        }
        const _a = new MariaClient('mariaTest', conf as MariaOptions);
      }, DAMConfigError);
    });

    await t.step('Failed connection', () => {
      const conf = {
        dialect: 'MARIA',
        host: envData.get('MARIA_HOST') || 'localhost',
        username: envData.get('MARIA_USER') || 'root',
        password: 'InvalidPassword',
        port: parseInt(envData.get('MARIA_PORT')) || 3306,
        database: envData.get('MARIA_DB') || 'mysql',
        poolSize: 1,
      }
      const client = new MariaClient('mariaTest', conf as MariaOptions);
      assertRejects(async () => {
        await client.connect();
      }, DAMConnectionError);
    });

    await t.step('Querying in Failed connection', () => {
      const conf = {
        dialect: 'MARIA',
        host: envData.get('MARIA_HOST') || 'localhost',
        username: envData.get('MARIA_USER') || 'root',
        password: 'InvalidPassword',
        port: parseInt(envData.get('MARIA_PORT')) || 3306,
        database: envData.get('MARIA_DB') || 'mysql',
        poolSize: 1,
      }
      const client = new MariaClient('mariaTest', conf as MariaOptions);
      assertRejects(async () => {
        try {
          await client.connect();
        } catch {
          // Suppress
        }
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'mysql';`,
        });
      }, DAMConnectionError);
    });
  });

  await t.step('Perform DB Operations', async (t) => {
    const conf = {
      dialect: 'MARIA',
      host: envData.get('MARIA_HOST') || 'localhost',
      username: envData.get('MARIA_USER') || 'root',
      password: envData.get('MARIA_PASS') || 'mariapw',
      port: parseInt(envData.get('MARIA_PORT')) || 3306,
      database: envData.get('MARIA_DB') || 'mysql',
      poolSize: 1,
    }
    const client = new MariaClient('mariaTest', conf as MariaOptions);

    await t.step('Connect', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      // Attempt calling connect again should not change anything
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();
    });

    await t.step('Close', async () => {
      await client.connect();
      await client.close();
      assertEquals('READY', client.status);
      // Attempt calling close again should not change anything
      await client.close();
      assertEquals('READY', client.status);
    });

    await t.step('Get Version', async () => {
      await client.connect();
      assert(await client.getVersion());
      await client.close();
    });
    
    await t.step('Query', async () => {
      assert(await client.execute({
        type: 'RAW',
        sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'mysql';`,
      }));
      await client.close();
    });

    await t.step('Query Error', async () => {
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM sdfsdfsdf WHERE schemaname = 'public'`,
        });
      }, DAMQueryError);
      await client.close();
    });

    await t.step('Query with Parameter', async () => {
      assert(await client.execute({
        type: 'RAW',
        sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ':schema:'`,
          params: {
            schema: 'mysql',
          }
      }));
      await client.close();
    });

    await t.step('Missing Parameter', async () => {
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM sdfsdfsdf WHERE schemaname = ':schema:'`,
        });
      }, DAMMissingParams);
      await client.close();
    });

    await t.step('Generate select query', async () => {
      assert(await client.select({
        type: 'SELECT',
        source: 'TABLES',
        schema: 'INFORMATION_SCHEMA',
        columns: ['TABLE_SCHEMA', 'TABLE_NAME', 'DATA_LENGTH'],
        joins: {
          Cols: {
            source: 'COLUMNS',
            schema: 'INFORMATION_SCHEMA',
            columns: ['COLUMN_NAME', 'DATA_TYPE', 'TABLE_SCHEMA', 'TABLE_NAME'], 
            relation: {
              'TABLE_SCHEMA': '$TABLE_SCHEMA',
              'TABLE_NAME': '$TABLE_NAME',
            },
          }
        },
        project: {
          'TableSchema': '$TABLE_SCHEMA',
          'TableName': '$TABLE_NAME',
          'Columns': { $aggr: 'JSON_ROW', $args: { 'ColumnName': '$Cols.COLUMN_NAME', 'DataType': '$Cols.DATA_TYPE' } }
        }, 
        limit: 10, 
        offset: 10,
        orderBy: {
          '$TABLE_SCHEMA': 'ASC',
        }
      }));
      await client.close();
    });

    await t.step('Generate count query', async () => {
      assert(await client.count({
        type: 'COUNT',
        source: 'TABLES',
        schema: 'INFORMATION_SCHEMA',
        columns: ['TABLE_SCHEMA', 'TABLE_NAME', 'DATA_LENGTH'],
        joins: {
          Cols: {
            source: 'COLUMNS',
            schema: 'INFORMATION_SCHEMA',
            columns: ['COLUMN_NAME', 'DATA_TYPE', 'TABLE_SCHEMA', 'TABLE_NAME'], 
            relation: {
              'TABLE_SCHEMA': '$TABLE_SCHEMA',
              'TABLE_NAME': '$TABLE_NAME',
            },
          }
        },
      }));
      await client.close();
    });
  });
});