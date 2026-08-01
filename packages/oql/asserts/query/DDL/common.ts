/**
 * Shared DDL validators: identifier-name format, column definition shape,
 * foreign-key constraint shape.
 *
 * @module asserts/Query/DDL/Common
 */

import type { SQLDataType } from '../../../types/mod.ts';

/** SQL types the DDL layer recognises. @internal */
const VALID_SQL_TYPES = new Set<SQLDataType>([
  'CHAR',
  'VARCHAR',
  'TEXT',
  'CLOB',
  'TINYINT',
  'SMALLINT',
  'INTEGER',
  'INT',
  'BIGINT',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'REAL',
  'BINARY',
  'VARBINARY',
  'BLOB',
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'BOOLEAN',
  'BIT',
  'JSON',
  'JSONB',
  'UUID',
  'XML',
]);

/** Foreign-key referential actions (ON DELETE / ON UPDATE). @internal */
const VALID_FK_ACTIONS = new Set([
  'CASCADE',
  'SET_NULL',
  'SET_DEFAULT',
  'RESTRICT',
  'NO_ACTION',
]);

/** Types where a `length` property is meaningful. @internal */
const LENGTH_TYPES = new Set(['CHAR', 'VARCHAR', 'BINARY', 'VARBINARY']);

/** Types where `precision` / `scale` are meaningful. @internal */
const DECIMAL_TYPES = new Set(['DECIMAL', 'NUMERIC']);

/**
 * Validates a SQL identifier (table, column, constraint, schema, index, view).
 * Must start with a letter or underscore, contain only `[a-zA-Z0-9_]`, and be
 * at most 63 characters (PostgreSQL's NAMEDATALEN limit).
 *
 * @param name - The identifier string
 * @param type - Identifier kind, used in error messages
 * @param context - Context label included in error messages
 */
export const validateIdentifierName = (
  name: string,
  type: 'table' | 'column' | 'constraint' | 'schema' | 'index' | 'view',
  context: string,
): void => {
  if (name.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context}: ${type} name cannot be empty or whitespace`,
    );
  }

  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    throw new TypeError(
      `Invalid ${context}: ${type} name '${name}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  if (name.length > 63) {
    throw new TypeError(
      `Invalid ${context}: ${type} name '${name}' exceeds maximum length of 63 characters`,
    );
  }
};

/**
 * Validates a column definition shape used in `CREATE_TABLE` / `ALTER_TABLE`:
 * `type` must be a known `SQLDataType`; `length` is only valid for
 * char/varchar/binary types; `precision`/`scale` are only valid for
 * decimal/numeric (and `scale <= precision`); `nullable` is boolean and
 * `comment` is string when present.
 *
 * @param colName - Column name, used in error messages
 * @param colDef - The column-definition object to validate
 * @param context - Context label included in error messages
 */
export const validateColumnDefinition = (
  colName: string,
  colDef: unknown,
  context: string,
): void => {
  if (typeof colDef !== 'object' || colDef === null) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' definition must be an object`,
    );
  }

  const col = colDef as Record<string, unknown>;

  if (!('type' in col) || col.type === null || col.type === undefined) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' must have a type`,
    );
  }
  if (typeof col.type !== 'string') {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' type must be a string, got ${typeof col
        .type}`,
    );
  }
  if (!VALID_SQL_TYPES.has(col.type as SQLDataType)) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' has invalid SQL type '${col.type}'`,
    );
  }

  if ('length' in col && col.length !== undefined) {
    if (!LENGTH_TYPES.has(col.type)) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' with type '${col.type}' cannot have length property (only valid for CHAR, VARCHAR, BINARY, VARBINARY)`,
      );
    }
    if (
      typeof col.length !== 'number' || col.length <= 0 ||
      !Number.isInteger(col.length)
    ) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' length must be a positive integer, got ${col.length}`,
      );
    }
  }

  if ('precision' in col && col.precision !== undefined) {
    if (!DECIMAL_TYPES.has(col.type)) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' with type '${col.type}' cannot have precision property (only valid for DECIMAL, NUMERIC)`,
      );
    }
    if (
      typeof col.precision !== 'number' || col.precision <= 0 ||
      !Number.isInteger(col.precision)
    ) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' precision must be a positive integer, got ${col.precision}`,
      );
    }
  }

  if ('scale' in col && col.scale !== undefined) {
    if (!DECIMAL_TYPES.has(col.type)) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' with type '${col.type}' cannot have scale property (only valid for DECIMAL, NUMERIC)`,
      );
    }
    if (
      typeof col.scale !== 'number' || col.scale < 0 ||
      !Number.isInteger(col.scale)
    ) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' scale must be a non-negative integer, got ${col.scale}`,
      );
    }
    if (
      'precision' in col && col.precision !== undefined &&
      typeof col.precision === 'number' && col.scale > col.precision
    ) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' scale (${col.scale}) cannot exceed precision (${col.precision})`,
      );
    }
  }

  if (
    'nullable' in col && col.nullable !== undefined &&
    typeof col.nullable !== 'boolean'
  ) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' nullable must be a boolean, got ${typeof col
        .nullable}`,
    );
  }

  if (
    'comment' in col && col.comment !== undefined &&
    typeof col.comment !== 'string'
  ) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' comment must be a string, got ${typeof col
        .comment}`,
    );
  }
};

/**
 * Validates a foreign-key constraint shape: non-empty `columns` array,
 * `references` with table/columns (and optional schema), matching column
 * counts on both sides, and optional `onDelete`/`onUpdate` actions from the
 * recognised set.
 *
 * @param constraintName - Constraint name, used in error messages
 * @param fk - The foreign-key constraint object
 * @param columnNames - Available column names for existence checks; pass an
 *   empty array (e.g. ALTER_TABLE) to skip the existence check, since the
 *   columns may be added in the same statement
 * @param context - Context label included in error messages
 */
export const validateForeignKeyConstraint = (
  constraintName: string,
  fk: unknown,
  columnNames: string[],
  context: string,
): void => {
  if (typeof fk !== 'object' || fk === null || Array.isArray(fk)) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' must be an object`,
    );
  }

  const fkObj = fk as Record<string, unknown>;

  if (
    !('columns' in fkObj) || !Array.isArray(fkObj.columns) ||
    fkObj.columns.length === 0
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' must have non-empty 'columns' array`,
    );
  }

  for (const fkCol of fkObj.columns) {
    if (typeof fkCol !== 'string') {
      throw new TypeError(
        `Invalid ${context}: foreignKeys constraint '${constraintName}' column must be a string, got ${typeof fkCol}`,
      );
    }
    if (columnNames.length > 0 && !columnNames.includes(fkCol)) {
      throw new TypeError(
        `Invalid ${context}: foreignKeys constraint '${constraintName}' column '${fkCol}' does not exist in columns definition`,
      );
    }
  }

  if (
    !('references' in fkObj) || typeof fkObj.references !== 'object' ||
    fkObj.references === null
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' must have 'references' object`,
    );
  }

  const refs = fkObj.references as Record<string, unknown>;

  if (
    !('table' in refs) || typeof refs.table !== 'string' ||
    refs.table.trim().length === 0
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' references.table must be a non-empty string`,
    );
  }
  validateIdentifierName(
    refs.table,
    'table',
    `${context} foreignKeys constraint '${constraintName}'`,
  );

  if ('schema' in refs && refs.schema !== undefined) {
    if (typeof refs.schema !== 'string' || refs.schema.trim().length === 0) {
      throw new TypeError(
        `Invalid ${context}: foreignKeys constraint '${constraintName}' references.schema must be a non-empty string if provided`,
      );
    }
    validateIdentifierName(
      refs.schema,
      'schema',
      `${context} foreignKeys constraint '${constraintName}'`,
    );
  }

  if (
    !('columns' in refs) || !Array.isArray(refs.columns) ||
    refs.columns.length === 0
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' references.columns must be a non-empty array`,
    );
  }

  if (refs.columns.length !== fkObj.columns.length) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' references.columns length must match foreignKey.columns length`,
    );
  }

  for (const refCol of refs.columns) {
    if (typeof refCol !== 'string' || refCol.trim().length === 0) {
      throw new TypeError(
        `Invalid ${context}: foreignKeys constraint '${constraintName}' references.columns must contain non-empty strings`,
      );
    }
  }

  if (
    'onDelete' in fkObj && fkObj.onDelete !== undefined &&
    !VALID_FK_ACTIONS.has(fkObj.onDelete as string)
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' onDelete must be one of ${
        Array.from(VALID_FK_ACTIONS).join(', ')
      }, got '${String(fkObj.onDelete)}'`,
    );
  }

  if (
    'onUpdate' in fkObj && fkObj.onUpdate !== undefined &&
    !VALID_FK_ACTIONS.has(fkObj.onUpdate as string)
  ) {
    throw new TypeError(
      `Invalid ${context}: foreignKeys constraint '${constraintName}' onUpdate must be one of ${
        Array.from(VALID_FK_ACTIONS).join(', ')
      }, got '${String(fkObj.onUpdate)}'`,
    );
  }
};
