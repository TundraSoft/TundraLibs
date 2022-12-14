export default {
  name: 'Groups',
  table: 'Groups',
  schema: 'SuperSchema',
  connection: 'default',
  columns: {
    Id: {
      type: 'INTEGER',
    },
    Name: {
      type: 'VARCHAR',
      isNullable: true,
      disableUpdate: true,
    },
    Enabled: {
      type: 'BOOLEAN',
      isNullable: true,
      security: 'ENCRYPT',
    },
  },
  primaryKeys: new Set(['Id']),
  uniqueKeys: {
    'name': new Set(['Name']),
  },
} as const;

const a = {
  name: 'Groups',
  table: 'Groups',
  schema: 'SuperSchema',
  connection: 'default',
  columns: {
    Id: {
      type: 'INTEGER',
    },
    Name: {
      type: 'VARCHAR',
      isNullable: true,
      disableUpdate: true,
    },
    Enabled: {
      type: 'BOOLEAN',
      isNullable: true,
      security: 'ENCRYPT',
    },
  },
  primaryKeys: new Set(['Id']),
  uniqueKeys: {
    'name': new Set(['Name']),
  },
} as const;

import { ModelType } from '../../types/mod.ts';
type A = ModelType<typeof a>;
