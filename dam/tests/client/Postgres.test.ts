import { assertEquals, assertThrows, assertRejects, assert } from '../../../dev.dependencies.ts';
import { PostgresClient, type PostgresOptions, DAMClientConfigError, DAMClientConnectionError, DAMClientQueryError, DAMClientMissingParamsError } from '../../mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';

const envData = envArgs('dam/tests');

Deno.test({ name: 'DAM > Client > Postgres' }, async (t) => {

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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: undefined,
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: null,
          host: envData.get('PG_HOST') || 'localhost',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: null, 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: undefined, 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: -1,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: 0,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          host: 'localhost', 
          port: null,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: undefined,
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: null,
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: undefined,
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: null,
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: undefined,
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: null,
          poolSize: 1,
        }
        const _a = new PostgresClient('pgtest', conf as unknown as PostgresOptions);
      }, DAMClientConfigError);
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
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('PG_HOST') || 'localhost', 
          username: envData.get('PG_USER') || 'postgres',
          password: envData.get('PG_PASS') || 'postgres',
          port: parseInt(envData.get('PG_PORT')) || 5432,
          database: envData.get('PG_DB') || 'postgres',
          poolSize: 0,
        }
        const _a = new PostgresClient('pgtest', conf as PostgresOptions);
      }, DAMClientConfigError);
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
        await client.close();
      }, DAMClientConnectionError);
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
        await client.query({
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'mysql';`,
        });
      }, DAMClientQueryError);
    });
  });

  await t.step('Basic Operations', async (t) => {
    const conf = {
      dialect: 'POSTGRES',
      host: envData.get('PG_HOST') || 'localhost',
      username: envData.get('PG_USER') || 'postgres',
      password: envData.get('PG_PASS') || 'postgrespw',
      port: parseInt(envData.get('PG_PORT')) || 5432,
      database: envData.get('PG_DB') || 'postgres',
      poolSize: 1,
    }
    const client = new PostgresClient('pgtest', conf as PostgresOptions);
    await t.step('Must connect to database', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      // Attempt calling connect again should not change anything
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();
    });

    await t.step('Correct value for status', async () => {
      await client.connect();
      await client.close();
      assertEquals('READY', client.status);
      // Attempt calling close again should not change anything
      await client.close();
      assertEquals('READY', client.status);
    });

    await t.step('Get Version', async () => {
      await client.connect();
      assert(await client.version());
      await client.close();
    });

    await t.step('Query', async () => {
      await client.connect();
      await client.query({
        sql: `SELECT 1 + 1;`,
      });
      await client.close();
    });

    await t.step('Query Error', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.query({
          sql: `SELECT dfssdf FROM sdfsdf;`, 
        });
      }, DAMClientQueryError);
      await client.close();
    });

    await t.step('Query with Parameter', async () => {
      await client.connect();
      assert(await client.query({
          sql: `SELECT 1 + :num:;`,
          params: {
            num: 1,
          }
        }));
      await client.close();
    });

    await t.step('Missing Parameter', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.query({
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ':schema:'`,
        });
      }, DAMClientMissingParamsError);
      await client.close();
    });

  });
});