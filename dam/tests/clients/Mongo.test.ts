import { MongoClient } from '../../clients/mod.ts';
import {
  afterAll,
  assertEquals,
  assertRejects,
  beforeAll,
  describe,
  it,
} from '../../../dev.dependencies.ts';
import { DAMClientError, DAMQueryError } from '../../errors/mod.ts';

import { alphaNumeric, nanoId } from '../../../id/mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';
const envData = envArgs('dam/tests');

describe({
  name: 'DAM',
  sanitizeExit: false,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  describe('Client', () => {
    describe({
      name: 'Mongo',
      sanitizeExit: false,
      sanitizeOps: false,
      sanitizeResources: false,
    }, () => {
      const client = new MongoClient('mongo', {
        dialect: 'MONGO',
        host: envData.get('MONGO_HOST') || 'localhost',
        username: envData.get('MONGO_USER') || undefined,
        password: envData.get('MONGO_PASS') || undefined,
        port: parseInt(envData.get('MONGO_PORT')) || 27017,
        database: envData.get('MONGO_DB') || 'test',
        poolSize: 1,
      });

      const schema = `test_${nanoId(4, alphaNumeric)}`;

      beforeAll(async () => {
        await client.connect();
      });

      afterAll(async () => {
        await client.close();
        assertEquals('READY', client.status);
      });

      it({
        name: 'Invalid connection',
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
      }, async () => {
        const a = new MongoClient('pg', {
          dialect: 'MONGO',
          host: 'no-host',
          username: 'pg',
          password: 'pg',
          database: 'd',
        });
        // const d = await a.connect();
        assertRejects(async () => await a.connect(), DAMClientError);
        await a.close();
      });

      it('Must connect to db', () => {
        assertEquals('CONNECTED', client.status);
      });

      // it('Must close connection', async () => {
      //   await client.close();
      //   assertEquals('READY', client.status)
      // });

      it('Basic querying', () => {
        const a = client.execute({
          type: 'RAW',
          sql: `CREATE SCHEMA ${schema};`,
        });
        assertRejects(async () => await a, DAMQueryError);
      });
    });
  });
});
