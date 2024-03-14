import {
  afterAll,
  assertEquals,
  assertRejects,
  assertThrows,
  describe,
  it,
} from '../../../dev.dependencies.ts';
import {} from '../../errors/mod.ts';

import { alphaNumeric, nanoId } from '../../../id/mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMQueryError,
  MariaClient,
  type MariaOptions,
} from '../../mod.ts';

const envData = envArgs('dam/tests');

describe({
  name: 'DAM',
  sanitizeExit: false,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  describe('Client', () => {
    describe('Maria', () => {
      const client = new MariaClient('maria', {
        dialect: 'MARIA',
        host: envData.get('MARIA_HOST') || 'localhost',
        username: envData.get('MARIA_USER') || 'root',
        password: envData.get('MARIA_PASS') || 'maria',
        port: parseInt(envData.get('MARIA_PORT')) || 3306,
        database: envData.get('MARIA_DB') || 'mysql',
        poolSize: 1,
      });

      const schema = `test_${nanoId(4, alphaNumeric)}`;

      // beforeAll(async () => {

      // })

      afterAll(async () => {
        await client.connect();
        await client.execute({ type: 'RAW', sql: `DROP SCHEMA ${schema};` });
        await client.close();
        assertEquals('READY', client.status);
      });

      it({
        name: 'Invalid Dialect',
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
      }, () => {
        const c = {
          dialect: 'MARIAAA',
          host: 'no-host',
          username: 'pg',
          password: 'pg',
          database: 'd',
        };
        assertThrows(
          () => new MariaClient('maria', c as MariaOptions),
          DAMConfigError,
        );
      });

      it({
        name: 'Invalid connection',
        sanitizeExit: false,
        sanitizeOps: false,
        sanitizeResources: false,
      }, async () => {
        const a = new MariaClient('maria', {
          dialect: 'MARIA',
          host: 'no-host',
          username: 'pg',
          password: 'pg',
          database: 'd',
        });
        assertRejects(async () => await a.connect(), DAMClientError);
        await a.close();
      });

      it({ name: 'Must connect to db', sanitizeOps: false }, async () => {
        await client.connect();
        assertEquals('CONNECTED', client.status);
        await client.close();
      });

      it('Basic querying', async () => {
        await client.connect();
        await client.execute({
          type: 'RAW',
          sql: `CREATE SCHEMA ${schema};`,
        });
        const resC = await client.execute({
          type: 'RAW',
          sql:
            `CREATE TABLE ${schema}.test1(\`Id\` INTEGER NOT NULL AUTO_INCREMENT, \`Name\` VARCHAR(100) NOT NULL, \`Email\` VARCHAR(255) NOT NULL, \`Password\` VARCHAR(255) NOT NULL, \`DOB\` DATE, \`AccountNumber\` INTEGER NOT NULL, \`Balance\` DECIMAL NOT NULL, \`Status\` BOOLEAN NOT NULL, PRIMARY KEY (\`Id\`));`,
        });
        assertEquals(0, resC.count);

        const resi = await client.execute({
          type: 'RAW',
          sql:
            `INSERT INTO ${schema}.test1 (\`Name\`, \`Email\`, \`Password\`, \`DOB\`, \`AccountNumber\`, \`Balance\`, \`Status\`) VALUES ('John Doe', 'john@doe.com', 'password', '2023-01-01', 123456, 34.32, true) RETURNING *;`,
        });

        assertEquals(1, resi.count);

        const resu = await client.execute({
          type: 'RAW',
          sql: `UPDATE ${schema}.test1 SET \`Status\` = false;`,
        });

        assertEquals(1, resu.count);

        const resd = await client.execute({
          type: 'RAW',
          sql: `DELETE FROM ${schema}.test1;`,
        });
        assertEquals(1, resd.count);

        await client.close();
      });

      it('Querying with parameters', async () => {
        await client.connect();
        const resi = await client.execute({
          type: 'RAW',
          sql:
            `INSERT INTO ${schema}.test1 (\`Name\`, \`Email\`, \`Password\`, \`DOB\`, \`AccountNumber\`, \`Balance\`, \`Status\`) VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
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
        await client.close();
      });

      it('Missing params test', async () => {
        await client.connect();
        const a = async () => {
          await client.execute({
            type: 'RAW',
            sql:
              `INSERT INTO test1 (\`Name\`, \`Email\`, \`Password\`, \`DOB\`, \`AccountNumber\`, \`Balance\`, \`Status\`) VALUES (:name:, :email:, :password:, :dob:, :accountNumber:, :balance:, :status:) RETURNING *;`,
          });
        };
        assertRejects(a, DAMQueryError);
        await client.close();
      });
    });
  });
});
