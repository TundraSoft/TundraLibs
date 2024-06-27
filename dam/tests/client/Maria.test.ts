import { assertEquals, assertThrows, assertRejects, assert } from '../../../dev.dependencies.ts';
import { MariaClient, type MariaOptions, DAMClientConfigError, DAMClientConnectionError, DAMClientQueryError, DAMClientMissingParamsError } from '../../mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';

const envData = envArgs('dam/tests');

Deno.test({ name: 'DAM > Client > Maria', sanitizeOps: false, sanitizeResources: false }, async (t) => {

  await t.step('Invalid Config', async (t) => {

    await t.step('Incorrect/Missing Dialect', () => {
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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: undefined,
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: null,
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: null, 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: undefined, 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
    });

    await t.step('Missing/Incorrect port', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost', 
          port: 65534323,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost', 
          port: -1,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost', 
          port: 0,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost', 
          port: null,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
    });

    await t.step('Username Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          // username: envData.get('MARIA_USER') || 'postgres',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: undefined,
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: null,
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
    });

    await t.step('Invalid Password', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          // password: envData.get('MARIA_PASS') || 'postgres',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatestPW', conf as MariaOptions);
        console.log('sdfgsdfsdfsdf')
      }, DAMClientConfigError);

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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: undefined,
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: null,
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
    });

    await t.step('Database Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          // database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

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
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: undefined,
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: null,
          poolSize: 1,
        }
        const _a = new MariaClient('mariatest', conf as unknown as MariaOptions);
      }, DAMClientConfigError);
    });

    await t.step('Invalid/Incorrect PoolSize', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'postgres',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: -1,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost', 
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 0,
        }
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);
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
      const client = new MariaClient('mariatest', conf as MariaOptions);
      assertRejects(async () => await client.connect(), DAMClientConnectionError);
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
      assertRejects(async () => {
        const client = new MariaClient('mariatest', conf as MariaOptions);
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
      dialect: 'MARIA',
      host: envData.get('MARIA_HOST') || 'localhost',
      username: envData.get('MARIA_USER') || 'maria',
      password: envData.get('MARIA_PASS') || 'mariapw',
      port: parseInt(envData.get('MARIA_PORT')) || 3307,
      database: envData.get('MARIA_DB') || 'mysql',
    }
    console.log(conf);
    const client = new MariaClient('mariatest', conf as MariaOptions);
    await t.step('Must connect to database', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      // Attempt calling connect again should not change anything
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();
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
          sql: `SELECT * FROM sdfsdfsdf WHERE TABLE_SCHEMA = 'public';`,
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
          sql: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = :schema:`,
        });
      }, DAMClientMissingParamsError);
      await client.close();
    });

  });
});