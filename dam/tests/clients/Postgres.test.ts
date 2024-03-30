import {
  afterAll,
  assertEquals,
  assertRejects,
  assertThrows,
  beforeAll,
  describe,
  it,
} from '../../../dev.dependencies.ts';

import { alphaNumeric, nanoId } from '../../../id/mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMQueryError,
  PostgresClient,
  type PostgresOptions,
} from '../../mod.ts';
const envData = envArgs('dam/tests');

describe('DAM', () => {
  describe('Client', () => {
    describe({
      name: 'Postgres',
      sanitizeExit: false,
      sanitizeOps: false,
      sanitizeResources: false,
    }, () => {
      const client = new PostgresClient('pgtest', {
        dialect: 'POSTGRES',
        host: envData.get('PG_HOST') || 'localhost',
        username: envData.get('PG_USER') || 'postgres',
        password: envData.get('PG_PASS') || 'postgres',
        port: parseInt(envData.get('PG_PORT')) || 5432,
        database: envData.get('PG_DB') || 'postgres',
        poolSize: 1,
      });

      const schema = `test_${nanoId(4, alphaNumeric)}`;

      beforeAll(async () => {
        await client.connect();
      });

      afterAll(async () => {
        await client.execute({
          type: 'RAW',
          sql: `DROP SCHEMA ${schema} CASCADE;`,
        });
        await client.close();
        assertEquals('READY', client.status);
      });

      it({
        name: 'Invalid Config',
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
      }, () => {
        const c = {
          dialect: 'POSSSSSS',
          host: 'no-host',
          username: 'pg',
          password: 'pg',
          database: 'd',
        };
        assertThrows(
          () => new PostgresClient('pgtest', c as PostgresOptions),
          DAMConfigError,
        );

        // Host Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              { dialect: 'POSTGRES' } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              { dialect: 'POSTGRES', host: '' } as PostgresOptions,
            ),
          DAMConfigError,
        );

        // Port Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                port: -1,
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                port: 1000,
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                port: 999999,
              } as PostgresOptions,
            ),
          DAMConfigError,
        );

        // Username Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                username: '',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );

        // Password Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                username: 'test',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                username: 'test',
                password: '',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );

        // Database Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                username: 'test',
                password: 'test',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                username: 'test',
                password: 'test',
                database: '',
              } as PostgresOptions,
            ),
          DAMConfigError,
        );

        // Pool Size Validation
        assertThrows(
          () =>
            new PostgresClient(
              'pgtest',
              {
                dialect: 'POSTGRES',
                host: 'localhost',
                poolSize: -1,
              } as PostgresOptions,
            ),
          DAMConfigError,
        );
      });

      it('Invalid connection', async () => {
        const a = new PostgresClient('pg', {
          dialect: 'POSTGRES',
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

      it('Basic querying', async () => {
        await client.execute({
          type: 'RAW',
          sql: `CREATE SCHEMA ${schema};`,
        });
        const resC = await client.execute({
          type: 'RAW',
          sql:
            `CREATE TABLE ${schema}.test1("Id" SERIAL NOT NULL, "Name" VARCHAR(100) NOT NULL, "Email" VARCHAR(255) NOT NULL, "Password" VARCHAR(255) NOT NULL, "DOB" DATE, "AccountNumber" INTEGER NOT NULL, "Balance" DECIMAL NOT NULL, "Status" BOOLEAN NOT NULL, PRIMARY KEY ("Id"));`,
        });
        assertEquals(0, resC.count);

        const resi = await client.execute({
          type: 'RAW',
          sql:
            `INSERT INTO ${schema}.test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES ('John Doe', 'john@doe.com', 'password', '2023-01-01', 123456, 34.32, true) RETURNING *;`,
        });

        assertEquals(1, resi.count);

        const resu = await client.execute({
          type: 'RAW',
          sql: `UPDATE ${schema}.test1 SET "Status" = false RETURNING *;`,
        });

        assertEquals(1, resu.count);

        const resd = await client.execute({
          type: 'RAW',
          sql: `DELETE FROM ${schema}.test1 RETURNING *;`,
        });
        assertEquals(1, resd.count);
      });

      it('Querying with parameters', async () => {
        const resi = await client.execute({
          type: 'RAW',
          sql:
            `INSERT INTO ${schema}.test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
          params: {
            name: 'Jane Doe',
            email: 'jane@doe.com',
            password: 'sdf',
            dob: '2023-02-02',
            accountNumber: 12345,
            balance: 0.99,
            status: true,
          },
        });
        assertEquals(1, resi.count);
      });

      it('Missing params test', () => {
        const a = async () => {
          await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
          });
        };
        assertRejects(a, DAMQueryError);
      });
    });
  });
});
