import type { Query } from '@tundralibs/oql';

/** The shapes referenced by every query below — a two-table schema
 * (users, orders) reused across SELECT/INSERT/INSERT_FROM_QUERY/UPSERT. */
export type Users = { id: number; username: string; email: string };
export type Orders = {
  id?: number; // DB-generated on insert
  userId: number;
  total: number;
  status: string;
  createdAt: Date;
};

/** SELECT with a JOIN, a filter on the joined column, and a SUM
 * aggregate + HAVING — the shape every translator diverges on most.
 * `Query<'SELECT'>` (no type params) rather than the fully-parametrized
 * form: `having`'s key is an aggregate ALIAS, not a column of either
 * table, and TypeScript can't tie it to the sibling `aggregates` entry
 * — that scoping rule is `assertQuery`'s job at runtime, not the type
 * checker's (see README's Comprehensive Filter System section). */
export const revenueByUser: Query<'SELECT'> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'username'],
  joins: {
    orders: {
      type: 'LEFT',
      table: 'orders',
      columns: ['userId', 'total', 'status'],
      on: { '@orders.@userId': '@id' },
    },
  },
  where: {
    '@orders.@status': 'completed',
  },
  aggregates: {
    revenue: { $$_aggregate: 'SUM', column: '@orders.@total' },
  },
  projection: {
    '@id': true,
    '@username': true,
  },
  having: {
    '@revenue': { $gte: 100 },
  },
};

/** INSERT using an Expression default (`NOW()`) instead of a literal
 * timestamp — every dialect emits its own native "current time" call. */
export const insertOrder: Query<'INSERT', Orders> = {
  type: 'INSERT',
  table: 'orders',
  columns: ['userId', 'total', 'status', 'createdAt'],
  data: {
    userId: 42,
    total: 99.5,
    status: 'pending',
    createdAt: { $$_expression: 'NOW' },
  },
};

/** `INSERT INTO ... SELECT ...` — appends completed orders into an
 * archive table. `columns` and the source SELECT's `projection` match
 * POSITIONALLY, by count, not by name — see OQL-Types.md's
 * INSERT_FROM_QUERY branch for the footgun. */
export const archiveCompletedOrders: Query<'INSERT_FROM_QUERY', Orders> = {
  type: 'INSERT_FROM_QUERY',
  table: 'orders_archive',
  columns: ['id', 'userId', 'total', 'status', 'createdAt'],
  query: {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId', 'total', 'status', 'createdAt'],
    projection: {
      '@id': true,
      '@userId': true,
      '@total': true,
      '@status': true,
      '@createdAt': true,
    },
    where: { '@status': 'completed' },
  },
};

/** UPSERT on a natural conflict key — `updateOnConflict` must be
 * disjoint from `conflictKeys` and every entry must exist in `data`. */
export const upsertOrder: Query<'UPSERT', Orders> = {
  type: 'UPSERT',
  table: 'orders',
  columns: ['id', 'userId', 'total', 'status', 'createdAt'],
  data: {
    id: 7,
    userId: 42,
    total: 120,
    status: 'completed',
    createdAt: { $$_expression: 'NOW' },
  },
  conflictKeys: ['@id'],
  updateOnConflict: ['@total', '@status'],
};

/** DDL — one CREATE_TABLE, to show DDL diverges just as much as DML. */
export const createOrdersTable: Query<'CREATE_TABLE'> = {
  type: 'CREATE_TABLE',
  table: 'orders',
  columns: {
    id: { type: 'INTEGER', nullable: false },
    userId: { type: 'INTEGER', nullable: false },
    total: { type: 'DECIMAL', nullable: false },
    status: { type: 'VARCHAR', length: 20, nullable: false },
    createdAt: { type: 'TIMESTAMP', nullable: false },
  },
  primaryKey: ['id'],
  ifNotExists: true,
};
