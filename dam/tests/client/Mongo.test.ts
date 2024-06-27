import { assertEquals, assertThrows, assertRejects, assert } from '../../../dev.dependencies.ts';
import { MongoClient, type MongoOptions, DAMClientConfigError, DAMClientConnectionError, DAMClientQueryError } from '../../mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';

const envData = envArgs('dam/tests');

Deno.test({ name: 'DAM > Client > Mongo' }, async (t) => {

  await t.step('Invalid Config', async (s) => {

    await s.step('Incorrect/Missing Dialect', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MONGOD',
          host: envData.get('MONGO_HOST') || 'localhost',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: '',
          host: envData.get('MONGO_HOST') || 'localhost',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          host: envData.get('MONGO_HOST') || 'localhost',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: undefined,
          host: envData.get('MONGO_HOST') || 'localhost',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: null,
          host: envData.get('MONGO_HOST') || 'localhost',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);
    });

    await s.step('Missing Host', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: '', 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: null, 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: undefined, 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);
    });

    await s.step('Incorrect port', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          host: 'localhost', 
          port: 65534323,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          host: 'localhost', 
          port: -1,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          host: 'localhost', 
          port: 0,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          host: 'localhost', 
          port: null,
          database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);
    });

    await s.step('Database Missing', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: envData.get('MONGO_HOST') || 'localhost', 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          // database: envData.get('MONGO_DB') || 'test',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: envData.get('MONGO_HOST') || 'localhost', 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: '',
        }
        const _a = new MongoClient('mongotest', conf as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: envData.get('MONGO_HOST') || 'localhost', 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: undefined,
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'MONGO',
          host: envData.get('MONGO_HOST') || 'localhost', 
          username: envData.get('MONGO_USER') || 'mongo',
          password: envData.get('MONGO_PASS') || 'mongopw',
          port: parseInt(envData.get('MONGO_PORT')) || 27017,
          database: null,
        }
        const _a = new MongoClient('mongotest', conf as unknown as MongoOptions);
      }, DAMClientConfigError);
    });

    await s.step('Failed connection', () => {
      const conf = {
        dialect: 'MONGO',
        host: envData.get('MONGO_HOST') || 'localhost', 
        username: envData.get('MONGO_USER') || 'mongo',
        password: 'InvalidPassword',
        port: 34323,
        database: envData.get('MONGO_DB') || 'test',
      }
      const client = new MongoClient('mongotest', conf as MongoOptions);
      assertRejects(async () => await client.connect(), DAMClientConnectionError);
    });
    
    await s.step('Querying in Failed connection', async () => {
      const conf = {
        dialect: 'MONGO',
        host: envData.get('MONGO_HOST') || 'localhost', 
        username: envData.get('MONGO_USER') || 'mongo',
        password: 'InvalidPassword',
        port: 34323,
        database: envData.get('MONGO_DB') || 'test',
      }
      await assertRejects(async () => {
        const client = new MongoClient('mongotest', conf as MongoOptions);
        try {
          await client.connect();
        } catch {
          // Suppress
        }
        await client.query({
          sql: JSON.stringify({ listDatabases: 1 }),
        });
      }, DAMClientConnectionError);
    });
  });

  await t.step('Basic Operations', async (s) => {
    const conf: Record<string, unknown> = {
      dialect: 'MONGO',
      host: envData.get('MONGO_HOST') || 'localhost',
      port: parseInt(envData.get('MONGO_PORT')) || 27017,
      database: envData.get('MONGO_DB') || 'test',
    }
    if(envData.has('MONGO_USER') && envData.has('MONGO_PASS')) {
      conf.username = envData.get('MONGO_USER');
      conf.password = envData.get('MONGO_PASS');
    }
    const client = new MongoClient('mongotest', conf as MongoOptions);
    await s.step('Must connect to database', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      // Attempt calling connect again should not change anything
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();
    });

    await s.step('Get Version', async () => {
      await client.connect();
      assert(await client.version());
      await client.close();
    });

    await s.step('Ping', async () => {
      await client.connect();
      assert(await client.ping());
      await client.close();
    });

    await s.step('Query', async () => {
      await client.connect();
      await client.query({
        sql: JSON.stringify({ ping: 1 }),
      });
      await client.close();
    });

    await s.step('Query Error', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.query({
          sql: JSON.stringify({ some: 'thing' }),
        });
      }, DAMClientQueryError);

      await assertRejects(async () => {
        await client.query({
          sql: 'SELECT 1;',
        });
      }, DAMClientQueryError);

      await client.close();
    });

    // This has no effect in mongodb
    await s.step('Query with Parameter', async () => {
      await client.connect();
      assert(await client.query({sql: JSON.stringify({ ping: 1 }), params: { some: 'thing' } }));
      await client.close();
    });

    await client.close();
  });
});