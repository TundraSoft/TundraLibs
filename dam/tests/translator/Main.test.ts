import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../../dev.dependencies.ts';
import {} from '../../errors/mod.ts';

import { alphaNumeric, nanoId } from '../../../id/mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';
import {
  DAMConfigError,
  DAMMissingParams,
  MariaClient,
  DAMQueryError, 
  type MariaOptions,
  type Query,
} from '../../mod.ts';

const envData = envArgs('dam/tests');

const schemaName = `test_${nanoId(5, alphaNumeric)}`;
const client = new MariaClient('mariatest', {
  dialect: 'MARIA',
  host: envData.get('MARIA_HOST') || 'localhost',
  username: envData.get('MARIA_USER') || 'root',
  password: envData.get('MARIA_PASS') || 'mariapw',
  port: parseInt(envData.get('MARIA_PORT')) || 3306,
  database: envData.get('MARIA_DB') || 'mysql',
  poolSize: 1,
} as MariaOptions);

const ugT = client.translator.createTable({
  type: 'CREATE_TABLE',
  schema: schemaName,
  source: 'UserGroups',
  columns: {
    UserId: { type: 'SERIAL' },
    GroupId: { type: 'SERIAL' },
  }, 
  primaryKeys: ['UserId', 'GroupId'],
  foreignKeys: {
    UserId: { schema: schemaName, source: 'Users', relation: { UserId: '$Id' } },
    GroupId: { schema: schemaName, source: 'Groups', relation: { GroupId: '$Id' } },
  },
});

const queries: Record<string, Record<string, unknown>> = {
  createSchema: { type: 'CREATE_SCHEMA', schema: schemaName }, 
  dropSchema: { type: 'DROP_SCHEMA', schema: schemaName },

  createUserTable: client.translator.createTable({
    type: 'CREATE_TABLE',
    schema: schemaName,
    source: 'Users',
    columns: {
      Id: { type: 'SERIAL' },
      Name: { type: 'VARCHAR', length: [255] },
      DOB: { type: 'DATE', nullable: true },
      Profile: { type: 'JSON', nullable: true },
      created: { type: 'TIMESTAMP' },
    }, 
    primaryKeys: ['Id'],
    uniqueKeys: { name: ['Name'] },
  })[0],
  createGroupTable: client.translator.createTable({
    type: 'CREATE_TABLE',
    schema: schemaName,
    source: 'Groups',
    columns: {
      Id: { type: 'SERIAL' },
      Name: { type: 'VARCHAR', length: [255] },
      Description: { type: 'TEXT', nullable: true },
    }, 
    primaryKeys: ['Id'],
    uniqueKeys: { name: ['Name'] },
  })[0],
  createUserGroupTable: ugT[0],
  createUserGroupRelation: ugT[1], 

  dropUserTable: client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'Users' }),
  dropGroupTable: client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'Groups' }),
  dropUserGroupTable: client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'UserGroups' }),
};

const selQuery = {
  type: 'SELECT',
  source: 'Users',
  schema: schemaName,
  columns: ['Id', 'Name', 'DOB', 'Profile', 'created'],
  project: {
    'UUID': {
      $expr: 'UUID'
    }, 
    'SubString': {
      $expr: 'SUBSTR',
      $args: ['Hello World', 5, { $expr: 'LENGTH', $args: 'Hello World' }]
    }, 
    'Concat': {
      $expr: 'CONCAT', 
      $args: ['Hello', ' ', 'World'],
    }, 
    'Replace': {
      $expr: 'REPLACE',
      $args: [
        'Hello World',
        'World',
        'Universe',
      ]
    }, 
    'Lower': {
      $expr: 'LOWER', 
      $args: {
        $expr: 'UUID', 
      }
    }, 
    'Upper': {
      $expr: 'UPPER', 
      $args: {
        $expr: 'UUID', 
      }
    }, 
    'Trim': {
      $expr: 'TRIM',
      $args: {
        $expr: 'UUID',
      },
    }
  }
};
Deno.test('DAM:Translator:Maria', async (t) => {

  await t.step('Generate Create Schema', async () => {
    const schemaDef = client.translator.createSchema({ type: 'CREATE_SCHEMA', schema: schemaName });
    assert(await client.execute(schemaDef));
    await client.close();
  });

  await t.step('Generate Create Table', async () => {
    const userDef = client.translator.createTable({
      type: 'CREATE_TABLE',
      schema: schemaName,
      source: 'Users',
      columns: {
        Id: { type: 'SERIAL' },
        Name: { type: 'VARCHAR', length: [255] },
        DOB: { type: 'DATE', nullable: true },
        Profile: { type: 'JSON', nullable: true },
        created: { type: 'TIMESTAMP' },
      }, 
      primaryKeys: ['Id'],
      uniqueKeys: { name: ['Name'] },
    });
    const groupDef = client.translator.createTable({
      type: 'CREATE_TABLE',
      schema: schemaName,
      source: 'Groups',
      columns: {
        Id: { type: 'SERIAL' },
        Name: { type: 'VARCHAR', length: [255] },
        Description: { type: 'TEXT', nullable: true },
      }, 
      primaryKeys: ['Id'],
      uniqueKeys: { name: ['Name'] },
    });
    const UserGroupDef = client.translator.createTable({
      type: 'CREATE_TABLE',
      schema: schemaName,
      source: 'UserGroups',
      columns: {
        UserId: { type: 'SERIAL' },
        GroupId: { type: 'SERIAL' },
      }, 
      primaryKeys: ['UserId', 'GroupId'],
      foreignKeys: {
        UserId: { schema: schemaName, source: 'Users', relation: { UserId: '$Id' } },
        GroupId: { schema: schemaName, source: 'Groups', relation: { GroupId: '$Id' } },
      },
    });
    await userDef.map(async (tableDef) => await client.execute(tableDef));
    await groupDef.map(async (tableDef) => await client.execute(tableDef));
    await UserGroupDef.map(async (tableDef) => await client.execute(tableDef));
    await client.close();
  });

  // Alter Table

  // Insert

  // Update

  // Delete

  // Create View

  // Alter View

  // Rename View

  // Select From View

  // Drop View
  await t.step('Generate Drop View', async () => {
    assert(await client.execute(client.translator.dropView({ type: 'DROP_VIEW', schema: schemaName, source: 'UsersGroup' })));
    await client.close();
  });

  await t.step('Generate Drop Table', async () => {
    const userDef = client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'Users' });
    const groupDef = client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'Groups' });
    const UserGroupDef = client.translator.dropTable({ type: 'DROP_TABLE', schema: schemaName, source: 'UserGroups' });
    assert(await client.execute(UserGroupDef));
    assert(await client.execute(groupDef));
    assert(await client.execute(userDef));
    await client.close();
  });
  
  await t.step('Generate Drop Schema', async () => {
    const schemaDef = client.translator.dropSchema({ type: 'DROP_SCHEMA', schema: schemaName });
    assert(await client.execute(schemaDef));
    await client.close();
  });
});