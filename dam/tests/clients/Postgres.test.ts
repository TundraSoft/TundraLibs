import {
  assert, 
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../../dev.dependencies.ts';

import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMConfigError,
  DAMQueryError,
  DAMConnectionError, 
  PostgresClient,
  DAMMissingParams,  
  type PostgresOptions,
} from '../../mod.ts';
const envData = envArgs('dam/tests');


Deno.test('DAM:Client:Postgres', async (t) => {

  await t.step('Invalid Config', async (t) => {
    await t.step('Incorrect/Missing Dialect', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: '',
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Missing Host', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: '', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Missing/Incorrect port', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: 65534323,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: 1,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Username Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          // username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: '',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Invalid Password', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          // password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtestPW', conf as PostgresOptions);
        console.log('sdfgsdfsdfsdf')
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: '',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Database Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          // database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: '',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Invalid/Incorrect PoolSize', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: -1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMConfigError);
    });

    await t.step('Failed connection', () => {
      const conf = {
        dialect: 'POSTGRES',
        host: envData.get('PG_HOST') || 'localhost', 
        username: envData.get('PG_USER') || 'postgres',
        password: 'InvalidPassword',
        port: parseInt(envData.get('PG_PORT')) || 5432,
        database: envData.get('PG_DB') || 'postgres',
        poolSize: 1,
      }
      assertRejects(async () => {
        const client = new PostgresClient('pgtest', conf as PostgresOptions);
        await client.connect();
      }, DAMConnectionError);
    });

    await t.step('Querying in Failed connection', () => {
      const conf = {
        dialect: 'POSTGRES',
        host: envData.get('PG_HOST') || 'localhost', 
        username: envData.get('PG_USER') || 'postgres',
        password: 'InvalidPassword',
        port: parseInt(envData.get('PG_PORT')) || 5432,
        database: envData.get('PG_DB') || 'postgres',
        poolSize: 1,
      }
      assertRejects(async () => {
        const client = new PostgresClient('pgtest', conf as PostgresOptions);
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
      dialect: 'POSTGRES',
      host: envData.get('PG_HOST') || 'localhost',
      username: envData.get('PG_USER') || 'postgres',
      password: envData.get('PG_PASS') || 'postgres',
      port: parseInt(envData.get('PG_PORT')) || 5432,
      database: envData.get('PG_DB') || 'postgres',
      poolSize: 1,
    }
    const client = new PostgresClient('pgtest', conf as PostgresOptions);
    try {
      await client.execute({ sql: 'CREATE EXTENSION pgcrypto;' });
    } catch {
      // Suppress
    }
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
      await client.connect();
      await client.execute({
        type: 'RAW',
        sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'public';`,
      });
      await client.close();
    });

    await t.step('Query Error', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM sdfsdfsdf WHERE TABLE_SCHEMA = 'public';`,
        });
      }, DAMQueryError);
      await client.close();
    });

    await t.step('Query with Parameter', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ':schema:'`,
          params: {
            schema: 'public',
          }
        });
      }, DAMQueryError);
      await client.close();
    });

    await t.step('Missing Parameter', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ':schema:'`,
        });
      }, DAMMissingParams);
      await client.close();
    });

    await t.step('Generate select query', async () => {
      assert(await client.select({
        type: 'SELECT',
        source: 'tables',
        schema: 'information_schema',
        columns: ['table_schema', 'table_name'],
        joins: {
          Cols: {
            source: 'columns',
            schema: 'information_schema',
            columns: ['column_name', 'data_type', 'table_schema', 'table_name'], 
            relation: {
              'table_schema': '$table_schema',
              'table_name': '$table_name',
            },
          }
        },
        project: {
          'TableSchema': '$table_schema',
          'TableName': '$table_name',
          'Columns': { $aggr: 'JSON_ROW', $args: { 'ColumnName': '$Cols.column_name', 'DataType': '$Cols.data_type' } }, 
          'UUID': {
            $expr: 'UUID'
          }, 
          'Length': {
            $expr: 'LENGTH',
            $args: 'Hello World'
          }, 
          'SubString': {
            $expr: 'SUBSTR',
            $args: ['Hello World', 6, { $expr: 'LENGTH', $args: 'Hello World' }]
          }, 
          'Nested': {
            $expr: 'TRIM', 
            $args: {
              $expr: 'SUBSTR',
              $args: ['Hello World', 6, { $expr: 'LENGTH', $args: 'Hello World' }]
            }
          }, 
          'Concat': {
            $expr: 'CONCAT', 
            $args: ['Hello', ' ', 'World'],
          }, 
          'Replace': {
            $expr: 'REPLACE',
            $args: [
              'Hello World',
              'World',
              'Universe',
            ]
          }, 
          'Lower': {
            $expr: 'LOWER', 
            $args: {
              $expr: 'UUID', 
            }
          }, 
          'Upper': {
            $expr: 'UPPER', 
            $args: {
              $expr: 'UUID', 
            }
          }, 
          'Trim': {
            $expr: 'TRIM',
            $args: {
              $expr: 'UUID',
            }, 
          }, 
          'encrypted': {
            $expr: 'ENCRYPT',
            $args: [ 'TundraLib', 'F2388451B0954326'],
          }, 
          'decrypted': {
            $expr: 'DECRYPT',
            $args: ['ww0ECQMCw+ltwWTrbtVp0j8BEfQxlXL5eIrce7l09SOs0f/hSsrTIIXDlea2mkHHeUC/t4cbIg5o/geyqKzmROk7lcLPsSXiiC24NJ2rDBQ=', 'F2388451B0954326'],
          }
        }, 
        limit: 10, 
        offset: 10,
        orderBy: {
          '$table_schema': 'ASC',
        }
      }));
      await client.close();
    });

    await t.step('Generate count query', async () => {
      await client.connect();
      assert(await client.count({
        type: 'COUNT',
        source: 'tables',
        schema: 'information_schema',
        columns: ['table_schema', 'table_name'],
        joins: {
          Cols: {
            source: 'columns',
            schema: 'information_schema',
            columns: ['column_name', 'data_type', 'table_schema', 'table_name'], 
            relation: {
              'table_schema': '$table_schema',
              'table_name': '$table_name',
            },
          }
        },
      }));
      await client.close();
    });
  });
});