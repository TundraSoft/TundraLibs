import {
  afterAll,
  assertEquals,
  assertRejects,
  assertThrows,
  beforeAll,
  describe,
  it,
} from '../../../dev.dependencies.ts';
import {
  // DAMClientError,
  DAMConfigError,
  DAMQueryError,
  SQLiteClient,
  type SQLiteOptions,
} from '../../mod.ts';
// import { nanoId, alphaNumeric } from '../../../id/mod.ts';

// Sanitize is present here for 1.40.x compatibility
describe({
  name: 'DAM',
  sanitizeExit: false,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  describe('Client', () => {
    describe('SQLite', () => {
      describe('Memory', () => {
        const client = new SQLiteClient('sqlite', {
          dialect: 'SQLITE',
          mode: 'MEMORY',
        });
        // const schema = `test_${nanoId(4, alphaNumeric)}`;

        it({
          name: 'Invalid Dialect',
          sanitizeExit: false,
          sanitizeOps: false,
          sanitizeResources: false,
        }, () => {
          const c = {
            dialect: 'SQLLLLL',
          };
          assertThrows(
            () => new SQLiteClient('maria', c as SQLiteOptions),
            DAMConfigError,
          );
        });

        it('Must connect to db', async () => {
          await client.connect();
          assertEquals('CONNECTED', client.status);
        });

        it('Must close connection', async () => {
          await client.connect();
          assertEquals('CONNECTED', client.status);
          await client.close();
          assertEquals('READY', client.status);
        });

        it('Basic querying', async () => {
          // await client.execute({
          //   type: 'RAW',
          //   sql: `CREATE SCHEMA ${schema};`,
          // });
          const resC = await client.execute({
            type: 'RAW',
            sql:
              'CREATE TABLE test1("Id" INTEGER NOT NULL, "Name" VARCHAR(100) NOT NULL, "Email" VARCHAR(255) NOT NULL, "Password" VARCHAR(255) NOT NULL, "DOB" DATE, "AccountNumber" INTEGER NOT NULL, "Balance" DECIMAL NOT NULL, "Status" BOOLEAN NOT NULL, PRIMARY KEY ("Id"));',
          });
          assertEquals(0, resC.count);

          const resi = await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES ('John Doe', 'john@doe.com', 'password', '2023-01-01', 123456, 34.32, true) RETURNING *;`,
          });

          assertEquals(1, resi.count);

          const resu = await client.execute({
            type: 'RAW',
            sql: `UPDATE test1 SET "Status" = false RETURNING *;`,
          });

          assertEquals(1, resu.count);

          const resd = await client.execute({
            type: 'RAW',
            sql: 'DELETE FROM test1 RETURNING *;',
          });
          assertEquals(1, resd.count);
        });

        it('Querying with parameters', async () => {
          const resi = await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
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

      describe('File', () => {
        const client = new SQLiteClient('sqlite2', {
          dialect: 'SQLITE',
          mode: 'FILE',
          path: 'dam/tests/testdata/',
        });
        // const schema = `test_${nanoId(4, alphaNumeric)}`;
        beforeAll(async () => {
          await client.connect();
        });

        afterAll(async () => {
          await client.close();
          assertEquals('READY', client.status);
          Deno.remove('dam/tests/testdata/sqlite2', { recursive: true });
        });

        it('Must connect to db', () => {
          assertEquals('CONNECTED', client.status);
        });

        // it('Must close connection', async () => {
        //   await client.connect();
        //   assertEquals('CONNECTED', client.status);
        //   await client.close();
        //   assertEquals('READY', client.status)
        // });

        it('Basic querying', async () => {
          // await client.execute({
          //   type: 'RAW',
          //   sql: `CREATE SCHEMA ${schema};`,
          // });
          const resC = await client.execute({
            type: 'RAW',
            sql:
              'CREATE TABLE test1("Id" INTEGER NOT NULL, "Name" VARCHAR(100) NOT NULL, "Email" VARCHAR(255) NOT NULL, "Password" VARCHAR(255) NOT NULL, "DOB" DATE, "AccountNumber" INTEGER NOT NULL, "Balance" DECIMAL NOT NULL, "Status" BOOLEAN NOT NULL, PRIMARY KEY ("Id"));',
          });
          assertEquals(0, resC.count);

          const resi = await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES ('John Doe', 'john@doe.com', 'password', '2023-01-01', 123456, 34.32, true) RETURNING *;`,
          });

          assertEquals(1, resi.count);

          const resu = await client.execute({
            type: 'RAW',
            sql: `UPDATE test1 SET "Status" = false RETURNING *;`,
          });

          assertEquals(1, resu.count);

          const resd = await client.execute({
            type: 'RAW',
            sql: 'DELETE FROM test1 RETURNING *;',
          });
          assertEquals(1, resd.count);
        });

        it('Querying with parameters', async () => {
          const resi = await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 ("Name", "Email", "Password", "DOB", "AccountNumber", "Balance", "Status") VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
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
});
