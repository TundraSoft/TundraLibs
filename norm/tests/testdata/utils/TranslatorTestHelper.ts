import {
  afterAll,
  afterEach,
  assertEquals,
  beforeAll,
  beforeEach,
  it,
} from '../../../../dev.dependencies.ts';
import { ConnectionOptions } from '../../../types/mod.ts';
import { AbstractClient } from '../../../AbstractConnection.ts';
import { QueryTranslator } from '../../../QueryTranslator.ts';
import { clientFactory } from './ClientTestHelper.ts';

export function runQueryTranslationTests<
  CO extends ConnectionOptions,
  C extends AbstractClient<CO>,
>(
  clientClass: { new (name: string, opts: CO): C },
  clientOpt: CO,
  isMemory = false,
) {
  let client: C;
  const qt = new QueryTranslator(clientOpt.dialect);
  const relatedTableName = 'relation_test_' +
    Math.floor(Math.random() * 1000000);
  const tableName = 'test_' + Math.floor(Math.random() * 1000000);
  const createRelatedTableQueries = qt.createTable({
    name: relatedTableName,
    columns: {
      'id': {
        'name': 'id',
        'type': 'SERIAL',
        'nullable': false,
      },
      'name': {
        'name': 'name',
        'type': 'VARCHAR',
        'length': 255,
        'nullable': true,
      },
      'code': {
        'name': 'code',
        'type': 'VARCHAR',
        'length': 6,
        'nullable': false,
      },
    },
    primaryKeys: ['id'],
    uniqueKeys: {
      'uk_code': ['code'],
    },
  });
  const createTableQueries = qt.createTable(
    {
      name: tableName,
      columns: {
        'id_a': {
          'name': 'id_a',
          'type': 'UUID',
          'nullable': false,
        },
        'id_b': {
          'name': 'id_b',
          'type': 'UUID',
          'nullable': false,
        },
        'name': {
          'name': 'name',
          'type': 'VARCHAR',
          'length': 255,
          'nullable': true,
        },
        'organization_code': {
          'name': 'organization_code',
          'type': 'VARCHAR',
          'length': 255,
          'nullable': true,
        },
        'email': {
          'name': 'email',
          'type': 'VARCHAR',
          'length': 255,
          'nullable': true,
        },
      },
      primaryKeys: ['id_a', 'id_b'],
      uniqueKeys: {
        'uk_email_orgcode': ['email', 'organization_code'],
      },
      foreignKeys: {
        'fk_organization_code': {
          'table': relatedTableName,
          'columnMap': {
            'organization_code': 'code',
          },
          'model': 'Organization',
          'hasMany': false,
        },
      },
    },
  );
  const dropTableQuery = qt.dropTable(tableName);
  beforeAll(async () => {
    if (isMemory) {
      client = clientFactory(
        clientClass,
        'QueryTranslatorTest',
        clientOpt,
      );
      await client.connect();
    }
  });

  beforeEach(() => {
    if (!isMemory) {
      client = clientFactory(
        clientClass,
        'QueryTranslatorTest',
        clientOpt,
      );
    }
  });

  afterEach(async () => {
    if (!isMemory) {
      await client.close();
    }
  });

  afterAll(async () => {
    if (isMemory) {
      await client.close();
    }
  });

  it('translator: should create related table and add keys etc', async () => {
    const res = await client.execute(createRelatedTableQueries[0]);
    assertEquals(res.type, 'CREATE');
    for (let i = 1; i < createRelatedTableQueries.length; i++) {
      const res = await client.execute(createRelatedTableQueries[i]);
      assertEquals(res.type, 'ALTER');
    }
  });

  it('translator: should create table with fk definition', async () => {
    const res = await client.execute(createTableQueries[0]);
    assertEquals(res.type, 'CREATE');
    for (let i = 1; i < createTableQueries.length; i++) {
      const res = await client.execute(createTableQueries[i]);
      assertEquals(res.type, 'ALTER');
    }
  });

  it('translator: should drop table with fk definition', async () => {
    const res = await client.execute(dropTableQuery);
    assertEquals(res.type, 'DROP');
  });

  it('translator: should drop related table', async () => {
    const res = await client.execute(qt.dropTable(relatedTableName));
    assertEquals(res.type, 'DROP');
  });
}
