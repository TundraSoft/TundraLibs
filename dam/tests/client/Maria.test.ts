import { asserts } from '../../../dev.dependencies.ts';
import {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientMissingParamsError,
  DAMClientQueryError,
  MariaClient,
  type MariaOptions,
} from '../../mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';

const envData = envArgs('dam/tests');

Deno.test({
  name: 'DAM > Client > Maria',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await t.step('Invalid Config', async (s) => {
    await s.step('Incorrect/Missing Dialect', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'POSTGRES',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: '',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: undefined,
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: null,
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Missing Host', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: '',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: null,
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: undefined,
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Incorrect port', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost',
          port: 65534323,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost',
          port: -1,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost',
          port: 0,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          host: 'localhost',
          port: null,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Username Missing', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          // username: envData.get('MARIA_USER') || 'postgres',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: '',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: undefined,
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: null,
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Invalid Password', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          // password: envData.get('MARIA_PASS') || 'postgres',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatestPW', conf as MariaOptions);
        console.log('sdfgsdfsdfsdf');
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: '',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: undefined,
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: null,
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Database Missing', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          // database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: '',
          poolSize: 1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: undefined,
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: null,
          poolSize: 1,
        };
        const _a = new MariaClient(
          'mariatest',
          conf as unknown as MariaOptions,
        );
      }, DAMClientConfigError);
    });

    await s.step('Invalid/Incorrect PoolSize', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'postgres',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: -1,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
          host: envData.get('MARIA_HOST') || 'localhost',
          username: envData.get('MARIA_USER') || 'root',
          password: envData.get('MARIA_PASS') || 'mariapw',
          port: parseInt(envData.get('MARIA_PORT')) || 3306,
          database: envData.get('MARIA_DB') || 'mysql',
          poolSize: 0,
        };
        const _a = new MariaClient('mariatest', conf as MariaOptions);
      }, DAMClientConfigError);
    });

    await s.step('Failed connection', async () => {
      const conf = {
        dialect: 'MARIA',
        host: envData.get('MARIA_HOST') || 'localhost',
        username: envData.get('MARIA_USER') || 'root',
        password: 'InvalidPassword',
        port: parseInt(envData.get('MARIA_PORT')) || 3306,
        database: envData.get('MARIA_DB') || 'mysql',
        poolSize: 1,
      };
      const client = new MariaClient('mariatest', conf as MariaOptions);
      await asserts.assertRejects(
        async () => await client.connect(),
        DAMClientConnectionError,
      );
    });

    await s.step('Querying in Failed connection', async () => {
      const conf = {
        dialect: 'MARIA',
        host: envData.get('MARIA_HOST') || 'localhost',
        username: envData.get('MARIA_USER') || 'root',
        password: 'InvalidPassword',
        port: parseInt(envData.get('MARIA_PORT')) || 3306,
        database: envData.get('MARIA_DB') || 'mysql',
        poolSize: 1,
      };
      await asserts.assertRejects(async () => {
        const client = new MariaClient('mariatest', conf as MariaOptions);
        try {
          await client.connect();
        } catch {
          // Suppress
        }
        await client.query({
          sql:
            `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'mysql';`,
        });
      }, DAMClientConnectionError);
    });
  });

  await t.step('Basic Operations', async (s) => {
    const conf = {
      dialect: 'MARIA',
      port: parseInt(envData.get('MARIA_PORT')) || 3306,
      host: envData.get('MARIA_HOST') || 'localhost',
      username: envData.get('MARIA_USER') || 'root',
      password: envData.get('MARIA_PASS') || 'mariapw',
      database: envData.get('MARIA_DB') || 'mysql',
    };
    const client = new MariaClient('mariatest', conf as MariaOptions);
    await s.step('Must connect to database', async () => {
      await client.connect();
      asserts.assertEquals('CONNECTED', client.status);
      // Attempt calling connect again should not change anything
      await client.connect();
      asserts.assertEquals('CONNECTED', client.status);
      await client.close();
    });

    await s.step('Ping', async () => {
      await client.connect();
      asserts.assertEquals(await client.ping(), true);
      await client.close();
    });

    await s.step('Get Version', async () => {
      await client.connect();
      asserts.assert(await client.version());
      await client.close();
    });

    await s.step('Query', async () => {
      await client.connect();
      await client.query({
        sql: `SELECT 1 + 1;`,
      });
      await client.close();
    });

    await s.step('Query Error', async () => {
      await client.connect();
      await asserts.assertRejects(async () => {
        await client.query({
          sql: `SELECT * FROM sdfsdfsdf WHERE TABLE_SCHEMA = 'public';`,
        });
      }, DAMClientQueryError);
      await client.close();
    });

    await s.step('Query with Parameter', async () => {
      await client.connect();
      const res = await client.query({
        sql: `SELECT :var1: as \`A\`, :var2: as \`B\`, :var1: as \`C\`;`,
        params: {
          var1: 1,
          var2: 'sdf',
        },
      });
      asserts.assertEquals(res.data[0].A, 1);
      asserts.assertEquals(res.data[0].C, 1);
      asserts.assertEquals(res.data[0].B, 'sdf');
      await client.close();
    });

    await s.step('Missing Parameter', async () => {
      await client.connect();
      await asserts.assertRejects(async () => {
        await client.query({
          sql:
            `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = :schema:`,
        });
      }, DAMClientMissingParamsError);
      await client.close();
    });
  });
});