import { queries } from './Queries.ts';
import {
  afterAll,
  assert,
  assertEquals,
  // assertRejects,
  assertThrows,
  beforeAll,
  describe,
  it,
} from '../../../dev.dependencies.ts';
// import { DAMClientError, DAMQueryError } from '../../errors/mod.ts';

// import { envArgs } from '../../../utils/envArgs.ts';
import {
  type CreateSchemaQuery,
  type CreateTableQuery,
  DAMTranslatorBaseError,
  type DeleteQuery,
  type DropSchemaQuery,
  type InsertQuery,
  type SelectQuery,
  SQLiteClient,
  type TruncateQuery,
  type UpdateQuery,
} from '../../mod.ts';

// const envData = envArgs('dam/tests');

describe('DAM', () => {
  describe('Translator', () => {
    describe({
      name: 'SQLite',
      sanitizeExit: false,
      sanitizeOps: false,
      sanitizeResources: false,
    }, () => {
      const client = new SQLiteClient('SQLiteFile', {
        dialect: 'SQLITE',
        mode: 'FILE',
        path: 'dam/tests/testdata/',
      });

      beforeAll(async () => {
        await client.connect();
      });

      afterAll(async () => {
        await client.close();
        assertEquals('READY', client.status);
        Deno.remove('dam/tests/testdata/sqlitefile', { recursive: true });
      });

      it('Should throw error on invalid type', () => {
        assertThrows(
          () =>
            client.translator.createSchema(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.dropSchema(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.createTable(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.dropTable(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.select(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.insert(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.update(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.delete(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.truncate(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
        assertThrows(
          () =>
            client.translator.count(
              JSON.parse(JSON.stringify({ type: 'INVALID' })),
            ),
          DAMTranslatorBaseError,
        );
      });

      it('create schema', async () => {
        const result = await client.execute(
          client.translator.createSchema(
            queries.create_schema as CreateSchemaQuery,
          ),
        );
        assert(result);
      });

      it('create table', async () => {
        const userQuery = client.translator.createTable(
          queries.create_user as unknown as CreateTableQuery,
        );
        const postQuery = client.translator.createTable(
          queries.create_post as unknown as CreateTableQuery,
        );
        assert(userQuery);
        assert(postQuery);
        assertEquals(postQuery.length, 2);
        const result = await client.execute(userQuery[0]);
        assert(result);
        const result2 = await client.execute(postQuery[0]);
        assert(result2);
        // const result3 = await client.execute(postQuery[1]);
        // assert(result3);
      });

      it('insert', async () => {
        const resUser = await client.insert(queries.insert_user as InsertQuery);
        assert(resUser);
        assertEquals(resUser.count, resUser.data.length);
        const resPost = await client.insert(queries.insert_post as InsertQuery);
        assert(resPost);
        assertEquals(resPost.count, resPost.data.length);
        assert(
          client.translator.beautify(
            client.translator.insert(queries.insert_post as InsertQuery),
          ),
        );
      });

      it('select', async () => {
        const res = await client.select(queries.select_post as SelectQuery);
        assert(res);
        assertEquals(res.count, res.data.length);
        assert(
          client.translator.beautify(
            client.translator.select(queries.select_post as SelectQuery),
          ),
        );
      });

      it('update', async () => {
        const res = await client.update(queries.update_user as UpdateQuery);
        assert(res);
        assert(
          client.translator.beautify(
            client.translator.update(queries.update_user as UpdateQuery),
          ),
        );
      });

      it('truncate table', async () => {
        const post = client.translator.truncate(
          queries.truncate_post as TruncateQuery,
        );
        assert(post);
        const res = await client.execute(post);
        assert(res);
      });

      it('delete records', async () => {
        const res = await client.delete(queries.delete_user as DeleteQuery);
        assert(res);
        assert(
          client.translator.beautify(
            client.translator.delete(queries.delete_user as DeleteQuery),
          ),
        );
      });

      it('Drop schema', async () => {
        const dschema = client.translator.dropSchema(
          queries.drop_schema as DropSchemaQuery,
        );
        assert(dschema);
        const result = await client.execute(dschema);
        assert(result);
      });
    });
  });
});
