/**
 * Table Query Validators
 *
 * This module provides validation for table-related DDL queries in OQL:
 * - CREATE_TABLE: Create a new table with columns and constraints
 * - ALTER_TABLE: Modify table structure (add/alter/drop columns, rename)
 * - DROP_TABLE: Remove an existing table
 *
 * @module asserts/Query/DDL/Table
 */

import type {
  ColumnDefinition,
  Query,
  SQLDataType,
  TableType,
} from '../../../types/mod.ts';

/**
 * Helper to validate table/column name format.
 * Names must start with letter/underscore and contain only alphanumeric + underscores.
 */
const validateIdentifierName = (
  name: string,
  type: 'table' | 'column' | 'constraint',
  context: string,
): void => {
  if (name.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context}: ${type} name cannot be empty or whitespace`,
    );
  }

  const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!nameRegex.test(name)) {
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
 * Helper to validate column definition.
 */
const validateColumnDefinition = (
  colName: string,
  colDef: unknown,
  context: string,
): void => {
  // Validate it's an object
  if (typeof colDef !== 'object' || colDef === null) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' definition must be an object`,
    );
  }

  const col = colDef as Record<string, unknown>;

  // Validate type exists
  if (!('type' in col) || col.type === null || col.type === undefined) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' must have a type`,
    );
  }

  // Validate type is a string
  if (typeof col.type !== 'string') {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' type must be a string, got ${typeof col
        .type}`,
    );
  }

  // Validate type is a valid SQLDataType
  const validTypes: SQLDataType[] = [
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
    'BOOLEAN',
    'BIT',
    'JSON',
    'JSONB',
    'UUID',
    'XML',
  ];
  if (!validTypes.includes(col.type as SQLDataType)) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' has invalid SQL type '${col.type}'`,
    );
  }

  // Validate length (only for string/binary types)
  if ('length' in col && col.length !== undefined) {
    const lengthTypes = ['CHAR', 'VARCHAR', 'BINARY', 'VARBINARY'];
    if (!lengthTypes.includes(col.type)) {
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

  // Validate precision and scale (only for decimal types)
  if ('precision' in col && col.precision !== undefined) {
    const decimalTypes = ['DECIMAL', 'NUMERIC'];
    if (!decimalTypes.includes(col.type)) {
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
    const decimalTypes = ['DECIMAL', 'NUMERIC'];
    if (!decimalTypes.includes(col.type)) {
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
    // Validate scale <= precision
    if (
      'precision' in col && col.precision !== undefined &&
      typeof col.precision === 'number' && col.scale > col.precision
    ) {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' scale (${col.scale}) cannot exceed precision (${col.precision})`,
      );
    }
  }

  // Validate nullable
  if ('nullable' in col && col.nullable !== undefined) {
    if (typeof col.nullable !== 'boolean') {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' nullable must be a boolean, got ${typeof col
          .nullable}`,
      );
    }
  }

  // Validate comment
  if ('comment' in col && col.comment !== undefined) {
    if (typeof col.comment !== 'string') {
      throw new TypeError(
        `Invalid ${context}: column '${colName}' comment must be a string, got ${typeof col
          .comment}`,
      );
    }
  }

  // Check for invalid properties based on type
  const validBaseProps = ['type', 'nullable', 'comment'];
  const lengthTypes = ['CHAR', 'VARCHAR', 'BINARY', 'VARBINARY'];
  const decimalTypes = ['DECIMAL', 'NUMERIC'];

  const validProps = [
    ...validBaseProps,
    ...(lengthTypes.includes(col.type) ? ['length'] : []),
    ...(decimalTypes.includes(col.type) ? ['precision', 'scale'] : []),
  ];

  const extraProps = Object.keys(col).filter((key) =>
    !validProps.includes(key)
  );
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid ${context}: column '${colName}' has unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Asserts that a value is a valid CREATE_TABLE query.
 *
 * Validates all CREATE_TABLE-specific properties:
 * - Required: type, table, columns
 * - Optional: schema, primaryKey, uniqueKeys, ifNotExists
 *
 * **Validation Rules**:
 * - `type` must be 'CREATE_TABLE'
 * - `table` must be a non-empty string with valid naming
 * - `columns` must be a non-empty record of column definitions
 * - Each column must have a valid SQL data type
 * - `length` property only valid for CHAR, VARCHAR, BINARY, VARBINARY
 * - `precision`/`scale` only valid for DECIMAL, NUMERIC
 * - `primaryKey` columns must exist in columns definition
 * - `uniqueKeys` columns must exist in columns definition
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CREATE_TABLE query
 *
 * @example
 * ```ts
 * // Valid CREATE_TABLE
 * const query = {
 *   type: 'CREATE_TABLE',
 *   table: 'users',
 *   columns: {
 *     id: { type: 'INTEGER', nullable: false },
 *     name: { type: 'VARCHAR', length: 255, nullable: false },
 *     email: { type: 'VARCHAR', length: 255, nullable: false },
 *     age: { type: 'INTEGER', nullable: true }
 *   },
 *   primaryKey: ['id'],
 *   uniqueKeys: { email_unique: ['email'] }
 * };
 * assertCreateTable(query); // ✓ Valid
 * ```
 */
export const assertCreateTable = <T extends Query<'CREATE_TABLE', TableType>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'CREATE_TABLE') {
    throw new TypeError(
      `Invalid CREATE_TABLE query: type must be 'CREATE_TABLE', got '${x.type}'`,
    );
  }

  // Validate table name exists
  if (!('table' in x) || x.table === null || x.table === undefined) {
    throw new TypeError(
      'Invalid CREATE_TABLE query: table name is required',
    );
  }

  // Validate table is a string
  if (typeof x.table !== 'string') {
    throw new TypeError(
      `Invalid CREATE_TABLE query: table must be a string, got ${typeof x
        .table}`,
    );
  }

  validateIdentifierName(x.table, 'table', 'CREATE_TABLE query');

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid CREATE_TABLE query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    validateIdentifierName(x.schema, 'table', 'CREATE_TABLE query');
  }

  // Validate columns exist
  if (!('columns' in x) || x.columns === null || x.columns === undefined) {
    throw new TypeError(
      'Invalid CREATE_TABLE query: columns are required',
    );
  }

  // Validate columns is an object
  if (typeof x.columns !== 'object' || Array.isArray(x.columns)) {
    throw new TypeError(
      `Invalid CREATE_TABLE query: columns must be an object, got ${typeof x
        .columns}`,
    );
  }

  // Validate columns is not empty
  const columnNames = Object.keys(x.columns);
  if (columnNames.length === 0) {
    throw new TypeError(
      'Invalid CREATE_TABLE query: at least one column is required',
    );
  }

  // Validate each column name and definition
  for (const colName of columnNames) {
    validateIdentifierName(colName, 'column', 'CREATE_TABLE query');
    validateColumnDefinition(
      colName,
      x.columns[colName] as ColumnDefinition,
      'CREATE_TABLE query',
    );
  }

  // Validate primaryKey if present
  if ('primaryKey' in x && x.primaryKey !== undefined) {
    if (!Array.isArray(x.primaryKey)) {
      throw new TypeError(
        `Invalid CREATE_TABLE query: primaryKey must be an array, got ${typeof x
          .primaryKey}`,
      );
    }
    if (x.primaryKey.length === 0) {
      throw new TypeError(
        'Invalid CREATE_TABLE query: primaryKey cannot be empty',
      );
    }
    for (const pkCol of x.primaryKey) {
      if (typeof pkCol !== 'string') {
        throw new TypeError(
          `Invalid CREATE_TABLE query: primaryKey column must be a string, got ${typeof pkCol}`,
        );
      }
      if (!columnNames.includes(pkCol as string)) {
        throw new TypeError(
          `Invalid CREATE_TABLE query: primaryKey column '${pkCol}' does not exist in columns definition`,
        );
      }
    }
  }

  // Validate uniqueKeys if present
  if ('uniqueKeys' in x && x.uniqueKeys !== undefined) {
    if (
      typeof x.uniqueKeys !== 'object' || Array.isArray(x.uniqueKeys) ||
      x.uniqueKeys === null
    ) {
      throw new TypeError(
        `Invalid CREATE_TABLE query: uniqueKeys must be an object, got ${typeof x
          .uniqueKeys}`,
      );
    }
    for (const [constraintName, columns] of Object.entries(x.uniqueKeys)) {
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
        if (!columnNames.includes(ukCol as string)) {
          throw new TypeError(
            `Invalid CREATE_TABLE query: uniqueKeys constraint '${constraintName}' column '${ukCol}' does not exist in columns definition`,
          );
        }
      }
    }
  }

  // Validate ifNotExists if present
  if ('ifNotExists' in x && x.ifNotExists !== undefined) {
    if (typeof x.ifNotExists !== 'boolean') {
      throw new TypeError(
        `Invalid CREATE_TABLE query: ifNotExists must be a boolean, got ${typeof x
          .ifNotExists}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = [
    'type',
    'table',
    'schema',
    'columns',
    'primaryKey',
    'uniqueKeys',
    'ifNotExists',
  ];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid CREATE_TABLE query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for CREATE_TABLE queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid CREATE_TABLE query, false otherwise
 */
export const isCreateTable = <T extends Query<'CREATE_TABLE', TableType>>(
  x: unknown,
): x is T => {
  try {
    assertCreateTable(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ALTER_TABLE query.
 *
 * Validates all ALTER_TABLE-specific properties:
 * - Required: type, table
 * - Optional: schema, addColumns, alterColumns, dropColumns, renameColumns, renameTo
 * - At least one modification operation required
 *
 * **Validation Rules**:
 * - `type` must be 'ALTER_TABLE'
 * - `table` must be a non-empty string with valid naming
 * - At least one of: addColumns, alterColumns, dropColumns, renameColumns, renameTo must be present
 * - `addColumns` must have valid column definitions
 * - `alterColumns` must have valid column definitions
 * - `dropColumns` must be an array of existing column names
 * - `renameColumns` maps old names to new valid names
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid ALTER_TABLE query
 *
 * @example
 * ```ts
 * // Valid ALTER_TABLE - add columns
 * const query = {
 *   type: 'ALTER_TABLE',
 *   table: 'users',
 *   addColumns: {
 *     phone: { type: 'VARCHAR', length: 20, nullable: true }
 *   }
 * };
 * assertAlterTable(query); // ✓ Valid
 *
 * // Valid ALTER_TABLE - multiple operations
 * const complex = {
 *   type: 'ALTER_TABLE',
 *   table: 'users',
 *   addColumns: { status: { type: 'VARCHAR', length: 50 } },
 *   dropColumns: ['old_field'],
 *   renameColumns: { email: 'email_address' }
 * };
 * assertAlterTable(complex); // ✓ Valid
 * ```
 */
export const assertAlterTable = <T extends Query<'ALTER_TABLE', TableType>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'ALTER_TABLE') {
    throw new TypeError(
      `Invalid ALTER_TABLE query: type must be 'ALTER_TABLE', got '${x.type}'`,
    );
  }

  // Validate table name exists
  if (!('table' in x) || x.table === null || x.table === undefined) {
    throw new TypeError(
      'Invalid ALTER_TABLE query: table name is required',
    );
  }

  // Validate table is a string
  if (typeof x.table !== 'string') {
    throw new TypeError(
      `Invalid ALTER_TABLE query: table must be a string, got ${typeof x
        .table}`,
    );
  }

  validateIdentifierName(x.table, 'table', 'ALTER_TABLE query');

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid ALTER_TABLE query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    validateIdentifierName(x.schema, 'table', 'ALTER_TABLE query');
  }

  // Check that at least one modification is present
  const hasAddColumns = 'addColumns' in x && x.addColumns !== undefined;
  const hasAlterColumns = 'alterColumns' in x && x.alterColumns !== undefined;
  const hasDropColumns = 'dropColumns' in x && x.dropColumns !== undefined;
  const hasRenameColumns = 'renameColumns' in x &&
    x.renameColumns !== undefined;
  const hasRenameTo = 'renameTo' in x && x.renameTo !== undefined;

  if (
    !hasAddColumns && !hasAlterColumns && !hasDropColumns &&
    !hasRenameColumns && !hasRenameTo
  ) {
    throw new TypeError(
      'Invalid ALTER_TABLE query: at least one modification operation (addColumns, alterColumns, dropColumns, renameColumns, renameTo) is required',
    );
  }

  // Validate addColumns if present
  if (hasAddColumns) {
    if (
      typeof x.addColumns !== 'object' || Array.isArray(x.addColumns) ||
      x.addColumns === null
    ) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: addColumns must be an object, got ${typeof x
          .addColumns}`,
      );
    }
    const addColNames = Object.keys(x.addColumns);
    if (addColNames.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: addColumns cannot be empty',
      );
    }
    for (const colName of addColNames) {
      validateIdentifierName(colName, 'column', 'ALTER_TABLE query');
      validateColumnDefinition(
        colName,
        x.addColumns[colName] as ColumnDefinition,
        'ALTER_TABLE query (addColumns)',
      );
    }
  }

  // Validate alterColumns if present
  if (hasAlterColumns) {
    if (
      typeof x.alterColumns !== 'object' || Array.isArray(x.alterColumns) ||
      x.alterColumns === null
    ) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: alterColumns must be an object, got ${typeof x
          .alterColumns}`,
      );
    }
    const alterColNames = Object.keys(x.alterColumns);
    if (alterColNames.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: alterColumns cannot be empty',
      );
    }
    for (const colName of alterColNames) {
      validateIdentifierName(colName, 'column', 'ALTER_TABLE query');
      validateColumnDefinition(
        colName,
        x.alterColumns[colName] as ColumnDefinition,
        'ALTER_TABLE query (alterColumns)',
      );
    }
  }

  // Validate dropColumns if present
  if (hasDropColumns) {
    if (!Array.isArray(x.dropColumns)) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: dropColumns must be an array, got ${typeof x
          .dropColumns}`,
      );
    }
    if (x.dropColumns.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: dropColumns cannot be empty',
      );
    }
    for (const colName of x.dropColumns) {
      if (typeof colName !== 'string') {
        throw new TypeError(
          `Invalid ALTER_TABLE query: dropColumns column must be a string, got ${typeof colName}`,
        );
      }
      validateIdentifierName(colName as string, 'column', 'ALTER_TABLE query');
    }
  }

  // Validate renameColumns if present
  if (hasRenameColumns) {
    if (
      typeof x.renameColumns !== 'object' || Array.isArray(x.renameColumns) ||
      x.renameColumns === null
    ) {
      throw new TypeError(
        `Invalid ALTER_TABLE query: renameColumns must be an object, got ${typeof x
          .renameColumns}`,
      );
    }
    const renameColNames = Object.keys(x.renameColumns);
    if (renameColNames.length === 0) {
      throw new TypeError(
        'Invalid ALTER_TABLE query: renameColumns cannot be empty',
      );
    }
    for (const [oldName, newName] of Object.entries(x.renameColumns)) {
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
        newName as string,
        'column',
        'ALTER_TABLE query (renameColumns new name)',
      );
    }
  }

  // Validate renameTo if present
  if (hasRenameTo) {
    if (typeof x.renameTo !== 'string') {
      throw new TypeError(
        `Invalid ALTER_TABLE query: renameTo must be a string, got ${typeof x
          .renameTo}`,
      );
    }
    validateIdentifierName(x.renameTo, 'table', 'ALTER_TABLE query (renameTo)');
  }

  // Validate no extra properties
  const validProps = [
    'type',
    'table',
    'schema',
    'addColumns',
    'alterColumns',
    'dropColumns',
    'renameColumns',
    'renameTo',
  ];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid ALTER_TABLE query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for ALTER_TABLE queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid ALTER_TABLE query, false otherwise
 */
export const isAlterTable = <T extends Query<'ALTER_TABLE', TableType>>(
  x: unknown,
): x is T => {
  try {
    assertAlterTable(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DROP_TABLE query.
 *
 * Validates all DROP_TABLE-specific properties:
 * - Required: type, table
 * - Optional: schema, ifExists, cascade
 *
 * **Validation Rules**:
 * - `type` must be 'DROP_TABLE'
 * - `table` must be a non-empty string with valid naming
 * - `ifExists` (optional) must be a boolean
 * - `cascade` (optional) must be a boolean
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid DROP_TABLE query
 *
 * @example
 * ```ts
 * // Valid DROP_TABLE
 * const query = {
 *   type: 'DROP_TABLE',
 *   table: 'users'
 * };
 * assertDropTable(query); // ✓ Valid
 *
 * // Valid with cascade
 * const cascadeQuery = {
 *   type: 'DROP_TABLE',
 *   table: 'users',
 *   cascade: true,
 *   ifExists: true
 * };
 * assertDropTable(cascadeQuery); // ✓ Valid
 * ```
 */
export const assertDropTable = <T extends Query<'DROP_TABLE', TableType>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'DROP_TABLE') {
    throw new TypeError(
      `Invalid DROP_TABLE query: type must be 'DROP_TABLE', got '${x.type}'`,
    );
  }

  // Validate table name exists
  if (!('table' in x) || x.table === null || x.table === undefined) {
    throw new TypeError(
      'Invalid DROP_TABLE query: table name is required',
    );
  }

  // Validate table is a string
  if (typeof x.table !== 'string') {
    throw new TypeError(
      `Invalid DROP_TABLE query: table must be a string, got ${typeof x.table}`,
    );
  }

  validateIdentifierName(x.table, 'table', 'DROP_TABLE query');

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid DROP_TABLE query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    validateIdentifierName(x.schema, 'table', 'DROP_TABLE query');
  }

  // Validate ifExists if present
  if ('ifExists' in x && x.ifExists !== undefined) {
    if (typeof x.ifExists !== 'boolean') {
      throw new TypeError(
        `Invalid DROP_TABLE query: ifExists must be a boolean, got ${typeof x
          .ifExists}`,
      );
    }
  }

  // Validate cascade if present
  if ('cascade' in x && x.cascade !== undefined) {
    if (typeof x.cascade !== 'boolean') {
      throw new TypeError(
        `Invalid DROP_TABLE query: cascade must be a boolean, got ${typeof x
          .cascade}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = ['type', 'table', 'schema', 'ifExists', 'cascade'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_TABLE query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for DROP_TABLE queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid DROP_TABLE query, false otherwise
 */
export const isDropTable = <T extends Query<'DROP_TABLE', TableType>>(
  x: unknown,
): x is T => {
  try {
    assertDropTable(x as T);
    return true;
  } catch {
    return false;
  }
};
