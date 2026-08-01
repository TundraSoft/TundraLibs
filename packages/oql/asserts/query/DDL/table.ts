/**
 * Table DDL validators: `CREATE_TABLE`, `ALTER_TABLE`, `DROP_TABLE`,
 * `TRUNCATE`.
 *
 * @module asserts/Query/DDL/Table
 */

import type { ColumnDefinition, Query, TableType } from '../../../types/mod.ts';
import {
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import {
  validateColumnDefinition,
  validateForeignKeyConstraint,
  validateIdentifierName,
} from './common.ts';

const CREATE_TABLE_PROPS = new Set([
  'type',
  'table',
  'schema',
  'columns',
  'primaryKey',
  'uniqueKeys',
  'foreignKeys',
  'ifNotExists',
]);

const ALTER_TABLE_PROPS = new Set([
  'type',
  'table',
  'schema',
  'addColumns',
  'alterColumns',
  'dropColumns',
  'renameColumns',
  'addForeignKeys',
  'dropForeignKeys',
  'renameTo',
]);

const DROP_TABLE_PROPS = new Set([
  'type',
  'table',
  'schema',
  'ifExists',
  'cascade',
]);

const TRUNCATE_PROPS = new Set(['type', 'table', 'schema', 'cascade']);

/**
 * Asserts that `query.table` is a valid table-name identifier and validates
 * the optional `schema` the same way. Sequences a `Common.ts` shape check
 * and the DDL-specific identifier check that DML callers don't need.
 * @internal
 */
const assertDDLTable = (
  query: Record<string, unknown>,
  context: string,
): void => {
  assertTableName(query, context);
  validateIdentifierName(query.table as string, 'table', `${context} query`);
  assertSchemaName(query, context);
  if (query.schema !== undefined) {
    validateIdentifierName(
      query.schema as string,
      'schema',
      `${context} query`,
    );
  }
};

/**
 * Throws if `query[propName]`, when present, is not a boolean.
 * @internal
 */
const validateOptionalBoolean = (
  query: Record<string, unknown>,
  propName: string,
  context: string,
): void => {
  if (!(propName in query) || query[propName] === undefined) return;
  if (typeof query[propName] !== 'boolean') {
    throw new TypeError(
      `Invalid ${context} query: ${propName} must be a boolean, got ${typeof query[
        propName
      ]}`,
    );
  }
};

/**
 * Throws if any property in `query` is not in `allowed`.
 * @internal
 */
const rejectExtraProps = (
  query: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void => {
  const extra = Object.keys(query).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new TypeError(
      `Invalid ${context} query: unexpected properties: ${extra.join(', ')}`,
    );
  }
};

/**
 * Validates a `Record<columnName, ColumnDefinition>` map: each key is a valid
 * column identifier and each value is a valid column definition.
 * @internal
 */
const validateColumnMap = (
  cols: unknown,
  context: string,
): string[] => {
  if (typeof cols !== 'object' || Array.isArray(cols) || cols === null) {
    throw new TypeError(
      `Invalid ${context}: must be an object, got ${typeof cols}`,
    );
  }
  const colNames = Object.keys(cols as Record<string, unknown>);
  for (const colName of colNames) {
    validateIdentifierName(colName, 'column', context);
    validateColumnDefinition(
      colName,
      (cols as Record<string, ColumnDefinition>)[colName],
      context,
    );
  }
  return colNames;
};

/**
 * Asserts a value is a valid `CREATE_TABLE` query: `table` is a valid
 * identifier, `columns` is a non-empty record of valid column definitions,
 * optional `primaryKey`/`uniqueKeys` columns must reference declared columns,
 * optional `foreignKeys` are valid FK constraints, optional `ifNotExists` is
 * a boolean.
 */
export const assertCreateTable: (
  x: unknown,
) => asserts x is Query<'CREATE_TABLE', TableType> = (
  x: unknown,
): asserts x is Query<'CREATE_TABLE', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid CREATE_TABLE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'CREATE_TABLE', 'CREATE_TABLE');
  assertDDLTable(query, 'CREATE_TABLE');

  if (
    !('columns' in query) || query.columns === null ||
    query.columns === undefined
  ) {
    throw new TypeError('Invalid CREATE_TABLE query: columns are required');
  }
  const columnNames = validateColumnMap(query.columns, 'CREATE_TABLE query');
  if (columnNames.length === 0) {
    throw new TypeError(
      'Invalid CREATE_TABLE query: at least one column is required',
    );
  }

  if ('primaryKey' in query && query.primaryKey !== undefined) {
    if (!Array.isArray(query.primaryKey)) {
      throw new TypeError(
        `Invalid CREATE_TABLE query: primaryKey must be an array, got ${typeof query
          .primaryKey}`,
      );
    }
    if (query.primaryKey.length === 0) {
      throw new TypeError(
        'Invalid CREATE_TABLE query: primaryKey cannot be empty',
      );
    }
    for (const pkCol of query.primaryKey) {
      if (typeof pkCol !== 'string') {
        throw new TypeError(
          `Invalid CREATE_TABLE query: primaryKey column must be a string, got ${typeof pkCol}`,
        );
      }
      if (!columnNames.includes(pkCol)) {
        throw new TypeError(
          `Invalid CREATE_TABLE query: primaryKey column '${pkCol}' does not exist in columns definition`,
        );
      }
    }
  }

  if ('uniqueKeys' in query && query.uniqueKeys !== undefined) {
    if (
      typeof query.uniqueKeys !== 'object' || Array.isArray(query.uniqueKeys) ||
      query.uniqueKeys === null
    ) {
      throw new TypeError(
        `Invalid CREATE_TABLE query: uniqueKeys must be an object, got ${typeof query
          .uniqueKeys}`,
      );
    }
    for (
      const [constraintName, columns] of Object.entries(
        query.uniqueKeys as Record<string, unknown>,
      )
    ) {
      validateIdentifierName(
        constraintName,
        'constraint',
        'CREATE_TABLE query',
      );
      if (!Array.isArray(columns)) {
        throw new TypeError(
          `Invalid CREATE_TABLE query: uniqueKeys constraint '${constraintName}' must be an array, got ${typeof columns}`,
        );
      }
      if (columns.length === 0) {
        throw new TypeError(
          `Invalid CREATE_TABLE query: uniqueKeys constraint '${constraintName}' cannot be empty`,
        );
      }
      for (const ukCol of columns) {
        if (typeof ukCol !== 'string') {
          throw new TypeError(
            `Invalid CREATE_TABLE query: uniqueKeys constraint '${constraintName}' column must be a string, got ${typeof ukCol}`,
          );
        }
        if (!columnNames.includes(ukCol)) {
          throw new TypeError(
            `Invalid CREATE_TABLE query: uniqueKeys constraint '${constraintName}' column '${ukCol}' does not exist in columns definition`,
          );
        }
      }
    }
  }

  if ('foreignKeys' in query && query.foreignKeys !== undefined) {
    if (
      typeof query.foreignKeys !== 'object' ||
      Array.isArray(query.foreignKeys) || query.foreignKeys === null
    ) {
      throw new TypeError(
        `Invalid CREATE_TABLE query: foreignKeys must be an object, got ${typeof query
          .foreignKeys}`,
      );
    }
    for (
      const [constraintName, fk] of Object.entries(
        query.foreignKeys as Record<string, unknown>,
      )
    ) {
      validateIdentifierName(
        constraintName,
        'constraint',
        'CREATE_TABLE query',
      );
      validateForeignKeyConstraint(
        constraintName,
        fk,
        columnNames,
        'CREATE_TABLE query',
      );
    }
  }

  validateOptionalBoolean(query, 'ifNotExists', 'CREATE_TABLE');
  rejectExtraProps(query, CREATE_TABLE_PROPS, 'CREATE_TABLE');
};

/** Type guard for {@link assertCreateTable}. */
export const isCreateTable = (
  x: unknown,
): x is Query<'CREATE_TABLE', TableType> => {
  try {
    assertCreateTable(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `ALTER_TABLE` query: `table` is a valid
 * identifier, optional `schema` is a valid identifier, and at least one
 * modification operation (addColumns / alterColumns / dropColumns /
 * renameColumns / addForeignKeys / dropForeignKeys / renameTo) is present.
 *
 * For `addForeignKeys`, the FK columns aren't checked against any column
 * list — they may be added in the same statement, so existence is enforced
 * at execution.
 */
export const assertAlterTable: (
  x: unknown,
) => asserts x is Query<'ALTER_TABLE', TableType> = (
  x: unknown,
): asserts x is Query<'ALTER_TABLE', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid ALTER_TABLE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'ALTER_TABLE', 'ALTER_TABLE');
  assertDDLTable(query, 'ALTER_TABLE');

  const ops = [
    'addColumns',
    'alterColumns',
    'dropColumns',
    'renameColumns',
    'addForeignKeys',
    'dropForeignKeys',
    'renameTo',
  ] as const;
  if (ops.every((op) => !(op in query) || query[op] === undefined)) {
    throw new TypeError(
      `Invalid ALTER_TABLE query: at least one modification operation (${
        ops.join(', ')
      }) is required`,
    );
  }

  if ('addColumns' in query && query.addColumns !== undefined) {
    const names = validateColumnMap(
      query.addColumns,
      'ALTER_TABLE query (addColumns)',
    );
    if (names.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: addColumns cannot be empty',
      );
    }
  }

  if ('alterColumns' in query && query.alterColumns !== undefined) {
    const names = validateColumnMap(
      query.alterColumns,
      'ALTER_TABLE query (alterColumns)',
    );
    if (names.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: alterColumns cannot be empty',
      );
    }
    // alterColumns REPLACES the definition. `nullable` must be explicit:
    // MariaDB's MODIFY resets omitted attributes (silently dropping
    // NOT NULL) while Postgres preserves them — an undefined nullable
    // means opposite outcomes per dialect.
    for (
      const [colName, def] of Object.entries(
        query.alterColumns as Record<string, { nullable?: unknown }>,
      )
    ) {
      if (typeof def.nullable !== 'boolean') {
        throw new TypeError(
          `Invalid ALTER_TABLE query: alterColumns.${colName} must set ` +
            `nullable explicitly (boolean) — dialects disagree on the ` +
            `default.`,
        );
      }
    }
  }

  if ('dropColumns' in query && query.dropColumns !== undefined) {
    if (!Array.isArray(query.dropColumns)) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: dropColumns must be an array, got ${typeof query
          .dropColumns}`,
      );
    }
    if (query.dropColumns.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: dropColumns cannot be empty',
      );
    }
    for (const colName of query.dropColumns) {
      if (typeof colName !== 'string') {
        throw new TypeError(
          `Invalid ALTER_TABLE query: dropColumns column must be a string, got ${typeof colName}`,
        );
      }
      validateIdentifierName(colName, 'column', 'ALTER_TABLE query');
    }
  }

  if ('renameColumns' in query && query.renameColumns !== undefined) {
    if (
      typeof query.renameColumns !== 'object' ||
      Array.isArray(query.renameColumns) || query.renameColumns === null
    ) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: renameColumns must be an object, got ${typeof query
          .renameColumns}`,
      );
    }
    const renameMap = query.renameColumns as Record<string, unknown>;
    if (Object.keys(renameMap).length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: renameColumns cannot be empty',
      );
    }
    for (const [oldName, newName] of Object.entries(renameMap)) {
      validateIdentifierName(
        oldName,
        'column',
        'ALTER_TABLE query (renameColumns old name)',
      );
      if (typeof newName !== 'string') {
        throw new TypeError(
          `Invalid ALTER_TABLE query: renameColumns new name for '${oldName}' must be a string, got ${typeof newName}`,
        );
      }
      validateIdentifierName(
        newName,
        'column',
        'ALTER_TABLE query (renameColumns new name)',
      );
    }
  }

  if ('addForeignKeys' in query && query.addForeignKeys !== undefined) {
    if (
      typeof query.addForeignKeys !== 'object' ||
      Array.isArray(query.addForeignKeys) || query.addForeignKeys === null
    ) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: addForeignKeys must be an object, got ${typeof query
          .addForeignKeys}`,
      );
    }
    if (Object.keys(query.addForeignKeys).length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: addForeignKeys cannot be empty',
      );
    }
    for (
      const [constraintName, fk] of Object.entries(
        query.addForeignKeys as Record<string, unknown>,
      )
    ) {
      validateIdentifierName(constraintName, 'constraint', 'ALTER_TABLE query');
      validateForeignKeyConstraint(
        constraintName,
        fk,
        [],
        'ALTER_TABLE query',
      );
    }
  }

  if ('dropForeignKeys' in query && query.dropForeignKeys !== undefined) {
    if (!Array.isArray(query.dropForeignKeys)) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: dropForeignKeys must be an array, got ${typeof query
          .dropForeignKeys}`,
      );
    }
    if (query.dropForeignKeys.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: dropForeignKeys cannot be empty',
      );
    }
    for (const constraintName of query.dropForeignKeys) {
      if (typeof constraintName !== 'string') {
        throw new TypeError(
          `Invalid ALTER_TABLE query: dropForeignKeys constraint name must be a string, got ${typeof constraintName}`,
        );
      }
      validateIdentifierName(constraintName, 'constraint', 'ALTER_TABLE query');
    }
  }

  if ('renameTo' in query && query.renameTo !== undefined) {
    if (typeof query.renameTo !== 'string') {
      throw new TypeError(
        `Invalid ALTER_TABLE query: renameTo must be a string, got ${typeof query
          .renameTo}`,
      );
    }
    validateIdentifierName(
      query.renameTo,
      'table',
      'ALTER_TABLE query (renameTo)',
    );
  }

  rejectExtraProps(query, ALTER_TABLE_PROPS, 'ALTER_TABLE');
};

/** Type guard for {@link assertAlterTable}. */
export const isAlterTable = (
  x: unknown,
): x is Query<'ALTER_TABLE', TableType> => {
  try {
    assertAlterTable(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `DROP_TABLE` query: `table` is a valid
 * identifier, optional `schema` is a valid identifier, optional
 * `ifExists`/`cascade` are booleans.
 */
export const assertDropTable: (
  x: unknown,
) => asserts x is Query<'DROP_TABLE', TableType> = (
  x: unknown,
): asserts x is Query<'DROP_TABLE', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DROP_TABLE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'DROP_TABLE', 'DROP_TABLE');
  assertDDLTable(query, 'DROP_TABLE');

  validateOptionalBoolean(query, 'ifExists', 'DROP_TABLE');
  validateOptionalBoolean(query, 'cascade', 'DROP_TABLE');
  rejectExtraProps(query, DROP_TABLE_PROPS, 'DROP_TABLE');
};

/** Type guard for {@link assertDropTable}. */
export const isDropTable = (
  x: unknown,
): x is Query<'DROP_TABLE', TableType> => {
  try {
    assertDropTable(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `TRUNCATE` query: `table` is a valid identifier,
 * optional `schema` is a valid identifier, optional `cascade` is boolean.
 *
 * TRUNCATE is a fast DDL operation that empties a table without per-row work
 * or trigger firing. Faster than DELETE but supports no WHERE clause and may
 * be irrecoverable on some engines.
 */
export const assertTruncate: (
  x: unknown,
) => asserts x is Query<'TRUNCATE', TableType> = (
  x: unknown,
): asserts x is Query<'TRUNCATE', TableType> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid TRUNCATE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'TRUNCATE', 'TRUNCATE');
  assertDDLTable(query, 'TRUNCATE');

  validateOptionalBoolean(query, 'cascade', 'TRUNCATE');
  rejectExtraProps(query, TRUNCATE_PROPS, 'TRUNCATE');
};

/** Type guard for {@link assertTruncate}. */
export const isTruncate = (
  x: unknown,
): x is Query<'TRUNCATE', TableType> => {
  try {
    assertTruncate(x);
    return true;
  } catch {
    return false;
  }
};
