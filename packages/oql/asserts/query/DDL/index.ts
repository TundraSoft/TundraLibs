/**
 * Index DDL validators: `CREATE_INDEX`, `DROP_INDEX`.
 *
 * @module asserts/Query/DDL/Index
 */

import type { Query, TableType } from '../../../types/mod.ts';
import {
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateIdentifierName } from './common.ts';
import { assertColumnIdentifier } from '../../columnIdentifier.ts';
import { assertQueryFilter } from '../../filters/mod.ts';

/** Storage methods recognised across the supported DBs. @internal */
const INDEX_METHODS = [
  'BTREE',
  'HASH',
  'GIN',
  'GIST',
  'BRIN',
  'FULLTEXT',
] as const;

const CREATE_INDEX_PROPS = new Set([
  'type',
  'index',
  'table',
  'schema',
  'columns',
  'method',
  'unique',
  'where',
  'ifNotExists',
]);

const DROP_INDEX_PROPS = new Set([
  'type',
  'index',
  'table',
  'schema',
  'ifExists',
  'cascade',
]);

/**
 * Asserts a value is a valid `CREATE_INDEX` query: `index` and `table` are
 * valid identifiers, `columns` is a non-empty array of column identifiers
 * (`@`-prefixed), optional `method` is one of {@link INDEX_METHODS}, optional
 * `unique`/`ifNotExists` are booleans, and optional `where` is a valid
 * partial-index filter.
 *
 * The `where` clause is validated without a column list — the actual column
 * existence check happens at execution time against the live schema.
 */
export const assertCreateIndex: (
  x: unknown,
) => asserts x is Query<'CREATE_INDEX', TableType> = (
  x: unknown,
): asserts x is Query<'CREATE_INDEX', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid CREATE_INDEX query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'CREATE_INDEX', 'CREATE_INDEX');

  if (
    !('index' in query) || query.index === null || query.index === undefined
  ) {
    throw new TypeError('Invalid CREATE_INDEX query: index name is required');
  }
  if (typeof query.index !== 'string') {
    throw new TypeError(
      `Invalid CREATE_INDEX query: index must be a string, got ${typeof query
        .index}`,
    );
  }
  validateIdentifierName(query.index, 'index', 'CREATE_INDEX query');

  assertTableName(query, 'CREATE_INDEX');
  validateIdentifierName(query.table as string, 'table', 'CREATE_INDEX query');

  assertSchemaName(query, 'CREATE_INDEX');
  if (query.schema !== undefined) {
    validateIdentifierName(
      query.schema as string,
      'schema',
      'CREATE_INDEX query',
    );
  }

  if (
    !('columns' in query) || query.columns === null ||
    query.columns === undefined
  ) {
    throw new TypeError('Invalid CREATE_INDEX query: columns are required');
  }
  if (!Array.isArray(query.columns)) {
    throw new TypeError(
      `Invalid CREATE_INDEX query: columns must be an array, got ${typeof query
        .columns}`,
    );
  }
  if (query.columns.length === 0) {
    throw new TypeError(
      'Invalid CREATE_INDEX query: at least one column is required',
    );
  }

  for (const [i, col] of query.columns.entries()) {
    if (typeof col !== 'string') {
      throw new TypeError(
        `Invalid CREATE_INDEX query: columns[${i}] must be a string, got ${typeof col}`,
      );
    }
    if (!col.startsWith('@')) {
      throw new TypeError(
        `Invalid CREATE_INDEX query: columns[${i}] must start with '@' prefix, got '${col}'`,
      );
    }
    try {
      assertColumnIdentifier(col);
    } catch (error) {
      throw new TypeError(
        `Invalid CREATE_INDEX query: columns[${i}] '${col}' is not a valid column identifier - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if ('method' in query && query.method !== undefined) {
    if (typeof query.method !== 'string') {
      throw new TypeError(
        `Invalid CREATE_INDEX query: method must be a string, got ${typeof query
          .method}`,
      );
    }
    if (!INDEX_METHODS.includes(query.method as typeof INDEX_METHODS[number])) {
      throw new TypeError(
        `Invalid CREATE_INDEX query: method must be one of ${
          INDEX_METHODS.join(', ')
        }, got '${query.method}'`,
      );
    }
  }

  if (
    'unique' in query && query.unique !== undefined &&
    typeof query.unique !== 'boolean'
  ) {
    throw new TypeError(
      `Invalid CREATE_INDEX query: unique must be a boolean, got ${typeof query
        .unique}`,
    );
  }

  if ('where' in query && query.where !== undefined) {
    // Partial-index `where` references columns of the indexed table. We don't
    // have that column list at this layer, so pass `undefined` (no constraint)
    // — column existence is enforced by the database at execution time.
    try {
      assertQueryFilter(query.where);
    } catch (error) {
      throw new TypeError(
        `Invalid CREATE_INDEX query: 'where' clause is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (
    'ifNotExists' in query && query.ifNotExists !== undefined &&
    typeof query.ifNotExists !== 'boolean'
  ) {
    throw new TypeError(
      `Invalid CREATE_INDEX query: ifNotExists must be a boolean, got ${typeof query
        .ifNotExists}`,
    );
  }

  const extraProps = Object.keys(query).filter(
    (key) => !CREATE_INDEX_PROPS.has(key),
  );
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid CREATE_INDEX query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/** Type guard for {@link assertCreateIndex}. */
export const isCreateIndex = (
  x: unknown,
): x is Query<'CREATE_INDEX', TableType> => {
  try {
    assertCreateIndex(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `DROP_INDEX` query: `index` is a valid
 * identifier, optional `schema` is a valid identifier, and optional
 * `ifExists`/`cascade` are booleans.
 */
export const assertDropIndex: (
  x: unknown,
) => asserts x is Query<'DROP_INDEX', TableType> = (
  x: unknown,
): asserts x is Query<'DROP_INDEX', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DROP_INDEX query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'DROP_INDEX', 'DROP_INDEX');

  if (
    !('index' in query) || query.index === null || query.index === undefined
  ) {
    throw new TypeError('Invalid DROP_INDEX query: index name is required');
  }
  if (typeof query.index !== 'string') {
    throw new TypeError(
      `Invalid DROP_INDEX query: index must be a string, got ${typeof query
        .index}`,
    );
  }
  validateIdentifierName(query.index, 'index', 'DROP_INDEX query');

  if (
    !('table' in query) || query.table === null || query.table === undefined
  ) {
    throw new TypeError('Invalid DROP_INDEX query: table name is required');
  }
  if (typeof query.table !== 'string') {
    throw new TypeError(
      `Invalid DROP_INDEX query: table must be a string, got ${typeof query
        .table}`,
    );
  }
  validateIdentifierName(query.table, 'table', 'DROP_INDEX query');

  if ('schema' in query && query.schema !== undefined) {
    if (typeof query.schema !== 'string') {
      throw new TypeError(
        `Invalid DROP_INDEX query: schema must be a string, got ${typeof query
          .schema}`,
      );
    }
    validateIdentifierName(query.schema, 'schema', 'DROP_INDEX query');
  }

  if (
    'ifExists' in query && query.ifExists !== undefined &&
    typeof query.ifExists !== 'boolean'
  ) {
    throw new TypeError(
      `Invalid DROP_INDEX query: ifExists must be a boolean, got ${typeof query
        .ifExists}`,
    );
  }

  if (
    'cascade' in query && query.cascade !== undefined &&
    typeof query.cascade !== 'boolean'
  ) {
    throw new TypeError(
      `Invalid DROP_INDEX query: cascade must be a boolean, got ${typeof query
        .cascade}`,
    );
  }

  const extraProps = Object.keys(query).filter(
    (key) => !DROP_INDEX_PROPS.has(key),
  );
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_INDEX query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/** Type guard for {@link assertDropIndex}. */
export const isDropIndex = (
  x: unknown,
): x is Query<'DROP_INDEX', TableType> => {
  try {
    assertDropIndex(x);
    return true;
  } catch {
    return false;
  }
};
