import { asserts } from '../../../dev.dependencies.ts';
import {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientMissingParamsError,
  DAMClientQueryError,
  SQLiteClient,
  type SQLiteOptions,
} from '../../mod.ts';

Deno.test({ name: 'DAM > Client > SQLite' }, async (t) => {
  await t.step('Invalid Config', async (t) => {
    await t.step('Incorrect/Missing Dialect', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'MARIA',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: '',
          mode: 'MEMORY',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          mode: 'MEMORY',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: undefined,
          mode: 'MEMORY',
        };
        const _a = new SQLiteClient(
          'sqlitetest',
          conf as unknown as SQLiteOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: null,
          mode: 'MEMORY',
        };
        const _a = new SQLiteClient(
          'sqlitetest',
          conf as unknown as SQLiteOptions,
        );
      }, DAMClientConfigError);
    });

    await t.step('Incorrect/Missing Mode', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'MEMORYDF',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: undefined,
        };
        const _a = new SQLiteClient(
          'sqlitetest',
          conf as unknown as SQLiteOptions,
        );
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: null,
        };
        const _a = new SQLiteClient(
          'sqlitetest',
          conf as unknown as SQLiteOptions,
        );
      }, DAMClientConfigError);
    });

    await t.step('Invalid File mode config', () => {
      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'FILE',
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'FILE',
          path: undefined,
        };
        const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      }, DAMClientConfigError);

      asserts.assertThrows(() => {
        const conf = {
          dialect: 'SQLITE',
          mode: 'FILE',
          path: null,
        };
        const _a = new SQLiteClient(
          'sqlitetest',
          conf as unknown as SQLiteOptions,
        );
      }, DAMClientConfigError);
    });

    await t.step('Querying on failed connection', () => {
      const conf = {
        dialect: 'SQLITE',
        mode: 'FILE',
        path: '/sdfsdf/sdFASDF',
      };
      const _a = new SQLiteClient('sqlitetest', conf as SQLiteOptions);
      asserts.assertRejects(async () => {
        try {
          await _a.connect();
        } catch (_e) {
          // suppress
        }
        await _a.query({ sql: 'SELECT 1' });
      }, DAMClientConnectionError);
    });
  });

  await t.step('Memory Mode > Basic Operations', async (t) => {
    const memoryConf = {
      dialect: 'SQLITE',
      mode: 'MEMORY',
    };
    const fileConf = {
      dialect: 'SQLITE',
      mode: 'FILE',
      path: 'dam/tests/fixtures',
    };
    const memClient = new SQLiteClient(
      'sqlitetest',
      memoryConf as SQLiteOptions,
    );
    const fileClient = new SQLiteClient(
      'sqlitetest',
      fileConf as SQLiteOptions,
    );

    await t.step('Connect', async () => {
      await memClient.connect();
      asserts.assertEquals(memClient.status, 'CONNECTED');
      await memClient.close();
      asserts.assertEquals(memClient.status, 'READY');

      await fileClient.connect();
      asserts.assertEquals(fileClient.status, 'CONNECTED');
      await fileClient.close();
      asserts.assertEquals(fileClient.status, 'READY');
    });

    await t.step('Ping', async () => {
      await memClient.connect();
      asserts.assertEquals(await memClient.ping(), true);
      await memClient.close();

      await fileClient.connect();
      asserts.assertEquals(await fileClient.ping(), true);
      await fileClient.close();
    });

    await t.step('Get Version', async () => {
      await memClient.connect();
      asserts.assert(await memClient.version());
      await memClient.close();

      await fileClient.connect();
      asserts.assert(await fileClient.version());
      await fileClient.close();
    });

    await t.step('Query', async () => {
      await memClient.connect();
      await asserts.assert(async () => {
        await memClient.query({
          sql:
            `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = 'table';`,
        });
      });
      await memClient.close();

      await fileClient.connect();
      await asserts.assert(async () => {
        await fileClient.query({
          sql:
            `SELECT sql FROM sqlite_master WHERE tbl_name = 'table_name' AND type = 'table';`,
        });
      });
      await fileClient.close();
    });

    await t.step('Query Error', async () => {
      await memClient.connect();
      await asserts.assertRejects(async () => {
        await memClient.query({
          sql: `SELECT dfssdf FROM sdfsdf;`,
        });
      }, DAMClientQueryError);
      await memClient.close();

      await fileClient.connect();
      await asserts.assertRejects(async () => {
        await fileClient.query({
          sql: `SELECT dfssdf FROM sdfsdf;`,
        });
      }, DAMClientQueryError);
      await fileClient.close();
    });

    await t.step('Query with params', async () => {
      await memClient.connect();
      const res1 = await memClient.query({
        sql: `SELECT :var1: as "A", :var2: as "B", :var1: as "C";`,
        params: {
          var1: 1,
          var2: 'sdf',
        },
      });
      asserts.assertEquals(res1.data[0].A, 1);
      asserts.assertEquals(res1.data[0].C, 1);
      asserts.assertEquals(res1.data[0].B, 'sdf');
      await memClient.close();

      await fileClient.connect();
      const res = await fileClient.query({
        sql: `SELECT :var1: as "A", :var2: as "B", :var1: as "C";`,
        params: {
          var1: 1,
          var2: 'sdf',
        },
      });
      asserts.assertEquals(res.data[0].A, 1);
      asserts.assertEquals(res.data[0].C, 1);
      asserts.assertEquals(res.data[0].B, 'sdf');
      await fileClient.close();
    });

    await t.step('Query with missing params', async () => {
      await memClient.connect();
      await asserts.assertRejects(async () => {
        await memClient.query({
          sql: `SELECT sql FROM sdf WHERE tbl_name = :tbl: AND type = 'table'`,
        });
      }, DAMClientMissingParamsError);
      await memClient.close();

      await fileClient.connect();
      await asserts.assertRejects(async () => {
        await fileClient.query({
          sql: `SELECT sql FROM sdf WHERE tbl_name = :tbl: AND type = 'table'`,
        });
      }, DAMClientMissingParamsError);
      await fileClient.close();
    });
  });
});
