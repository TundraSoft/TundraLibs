import {
  assert, 
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../../dev.dependencies.ts';

import {
  DAMConfigError,
  DAMQueryError,
  DAMMissingParams, 
  SQLiteClient, 
  type SQLiteOptions,
} from '../../mod.ts';

Deno.test('DAM:Client:SQLite', async (t) => {

  await t.step('Invalid Config', async (t) => {
    await t.step('Incorrect/Missing Dialect', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'SQLITES',
          mode: 'MEMORY',
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: '',
          mode: 'MEMORY',
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          mode: 'MEMORY',
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);
    });

    await t.step('Missing Mode', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'JLHV'
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: '', 
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);
    });

    await t.step('Path for File mode', () => {
      assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'FILE',
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);

      assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'FILE', 
          path: '/woo/hoo'
        }
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMConfigError);
    });

  });


  await t.step('Perform DB Operations', async (t) => {
    const conf = {
      dialect: 'SQLITE',
      mode: 'MEMORY',
    }
    const client = new SQLiteClient('sqlitetest', conf as SQLiteOptions);

    const confFile = {
      dialect: 'SQLITE',
      mode: 'FILE',
      path: 'dam/tests/fixtures/', 
    };
    const clientFile = new SQLiteClient('sqlitetest2', confFile as SQLiteOptions);

    await t.step('Connect', async () => {
      await client.connect();
      assertEquals('CONNECTED', client.status);
      await client.close();

      await clientFile.connect();
      assertEquals('CONNECTED', clientFile.status);
      await clientFile.close();
    });

    await t.step('Close', async () => {
      await client.connect();
      await client.close();
      assertEquals('READY', client.status);

      await clientFile.connect();
      await clientFile.close();
      assertEquals('READY', clientFile.status);
    });

    await t.step('Query', async () => {
      await client.connect();
      assert(await client.execute({
        type: 'RAW',
        sql: `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = 'table';`,
      }));
      await client.close();

      await clientFile.connect();
      assert(await clientFile.execute({
        type: 'RAW',
        sql: `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = 'table';`,
      }));
      await clientFile.close();
    });

    await t.step('Query Error', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT sql FROM sdf WHERE tbl_name = 'table_name' AND type = 'table'`,
        });
      }, DAMQueryError);
      await client.close();

      await clientFile.connect();
      await assertRejects(async () => {
        await clientFile.execute({
          type: 'RAW',
          sql: `SELECT sql FROM sdf WHERE tbl_name = 'table_name' AND type = 'table'`,
        });
      }, DAMQueryError);
      await clientFile.close();
    });

    await t.step('Query with Parameter', async () => {
      await client.connect();
      assert(await client.execute({
        type: 'RAW',
        sql: `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = :type:`,
          params: {
            type: 'table',
          }
      }));
      await client.close();

      await clientFile.connect();
      assert(await clientFile.execute({
        type: 'RAW',
        sql: `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = :type:`,
          params: {
            type: 'table',
          }
      }));
      await clientFile.close();
    });

    await t.step('Missing Parameter', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `SELECT sql FROM sdf WHERE tbl_name = 'table_name' AND type = :type:`,
        });
      }, DAMMissingParams);
      await client.close();

      await clientFile.connect();
      await assertRejects(async () => {
        await clientFile.execute({
          type: 'RAW',
          sql: `SELECT sql FROM sdf WHERE tbl_name = 'table_name' AND type = :type:`,
        });
      }, DAMMissingParams);
      await clientFile.close();
    });

    await t.step('Create Schema', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `CREATE SCHEMA test;`,
        });
      }, DAMQueryError);
      await client.close();

      await clientFile.connect();
      
      assert(await clientFile.execute({ type: 'RAW', sql: `CREATE SCHEMA IF NOT EXISTS test;` }));
      await clientFile.close();
    });

    await t.step('Must load the schema on re-connect', async () => {
      await clientFile.connect();
      await assertRejects(async () => {
        await clientFile.execute({ type: 'RAW', sql: `CREATE SCHEMA IF NOT EXISTS test;` });
      }, DAMQueryError);
      await clientFile.close();
    });

    await t.step('Must drop the schema', async () => {
      await client.connect();
      await assertRejects(async () => {
        await client.execute({
          type: 'RAW',
          sql: `DROP SCHEMA test;`,
        });
      }, DAMQueryError);
      await client.close();

      await clientFile.connect();
      
      assert(await clientFile.execute({ type: 'RAW', sql: `DROP SCHEMA test;` }));
      await clientFile.close();
    });

  });
});