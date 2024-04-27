import {
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../../dev.dependencies.ts';

import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMConfigError,
  DAMQueryError,
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

    await t.step('Connect', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();
    });

    await t.step('Close', async () => {
      await client.connect();
      await client.close();
      assertEquals('READY', client.status);
    });

    await t.step('Query', async () => {
      await client.connect();
      await client.execute({
        type: 'RAW',
        sql: `SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public';`,
      });
      await client.close();
    });

    await t.step('Query Error', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM sdfsdfsdf WHERE schemaname = 'public'`,
        });
      }, DAMQueryError);
      await client.close();
    });

    await t.step('Query with Parameter', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT * FROM pg_catalog.pg_tables WHERE schemaname = ':schema:'`,
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
          sql: `SELECT * FROM sdfsdfsdf WHERE schemaname = ':schema:'`,
        });
      }, DAMMissingParams);
      await client.close();
    });
  });
});