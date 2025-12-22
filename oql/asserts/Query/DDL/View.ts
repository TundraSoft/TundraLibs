/**
 * View Query Validators
 *
 * This module provides validation for view-related DDL queries in OQL:
 * - CREATE_VIEW: Create a new view or materialized view
 * - DROP_VIEW: Remove an existing view
 * - ALTER_VIEW: Modify view definition or rename
 * - REFRESH_MATERIALIZED_VIEW: Refresh materialized view data
 *
 * @module asserts/Query/DDL/View
 */

import type { Query } from '../../../types/mod.ts';
import { assertSelectQuery } from '../DML/Select.ts';

/**
 * Asserts that a value is a valid CREATE_VIEW query.
 *
 * Validates all CREATE_VIEW-specific properties:
 * - Required: type, view, query
 * - Optional: schema, materialized, ifNotExists, orReplace
 *
 * **Validation Rules**:
 * - `type` must be 'CREATE_VIEW'
 * - `view` must be a non-empty string with valid naming
 * - `query` must be a valid SELECT query
 * - `materialized` must be a boolean if present
 * - `ifNotExists` must be a boolean if present
 * - `orReplace` must be a boolean if present
 * - `ifNotExists` and `orReplace` cannot both be true
 * - View names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CREATE_VIEW query
 *
 * @example
 * ```ts
 * // Valid CREATE_VIEW
 * const query = {
 *   type: 'CREATE_VIEW',
 *   view: 'active_users',
 *   query: { type: 'SELECT', table: 'users', where: { '@status': 'active' } }
 * };
 * assertCreateView(query); // ✓ Valid
 *
 * // Valid materialized view
 * const matView = {
 *   type: 'CREATE_VIEW',
 *   view: 'user_stats',
 *   query: { type: 'SELECT', table: 'users' },
 *   materialized: true
 * };
 * assertCreateView(matView); // ✓ Valid
 * ```
 */
export const assertCreateView = <T extends Query<'CREATE_VIEW', any, any>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'CREATE_VIEW') {
    throw new TypeError(
      `Invalid CREATE_VIEW query: type must be 'CREATE_VIEW', got '${x.type}'`,
    );
  }

  // Validate view name exists
  if (!('view' in x) || x.view === null || x.view === undefined) {
    throw new TypeError(
      'Invalid CREATE_VIEW query: view name is required',
    );
  }

  // Validate view is a string
  if (typeof x.view !== 'string') {
    throw new TypeError(
      `Invalid CREATE_VIEW query: view must be a string, got ${typeof x.view}`,
    );
  }

  // Validate view name is not empty
  if (x.view.trim().length === 0) {
    throw new TypeError(
      'Invalid CREATE_VIEW query: view name cannot be empty or whitespace',
    );
  }

  // Validate view name format (alphanumeric, underscores, cannot start with number)
  const viewNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!viewNameRegex.test(x.view)) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: view name '${x.view}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate view name length (reasonable limit)
  if (x.view.length > 63) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: view name '${x.view}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid CREATE_VIEW query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    if (x.schema.trim().length === 0) {
      throw new TypeError(
        'Invalid CREATE_VIEW query: schema name cannot be empty or whitespace',
      );
    }
    const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!schemaNameRegex.test(x.schema)) {
      throw new TypeError(
        `Invalid CREATE_VIEW query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
      );
    }
    if (x.schema.length > 63) {
      throw new TypeError(
        `Invalid CREATE_VIEW query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
      );
    }
  }

  // Validate query exists and is a SELECT query
  if (!('query' in x) || x.query === null || x.query === undefined) {
    throw new TypeError(
      'Invalid CREATE_VIEW query: query is required',
    );
  }

  try {
    assertSelectQuery(x.query as any);
  } catch (error) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: query must be a valid SELECT query - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Validate materialized if present
  if ('materialized' in x && x.materialized !== undefined) {
    if (typeof x.materialized !== 'boolean') {
      throw new TypeError(
        `Invalid CREATE_VIEW query: materialized must be a boolean, got ${typeof x
          .materialized}`,
      );
    }
  }

  // Validate ifNotExists if present
  if ('ifNotExists' in x && x.ifNotExists !== undefined) {
    if (typeof x.ifNotExists !== 'boolean') {
      throw new TypeError(
        `Invalid CREATE_VIEW query: ifNotExists must be a boolean, got ${typeof x
          .ifNotExists}`,
      );
    }
  }

  // Validate orReplace if present
  if ('orReplace' in x && x.orReplace !== undefined) {
    if (typeof x.orReplace !== 'boolean') {
      throw new TypeError(
        `Invalid CREATE_VIEW query: orReplace must be a boolean, got ${typeof x
          .orReplace}`,
      );
    }
  }

  // Validate that ifNotExists and orReplace are not both true
  if (x.ifNotExists && x.orReplace) {
    throw new TypeError(
      'Invalid CREATE_VIEW query: ifNotExists and orReplace cannot both be true',
    );
  }

  // Validate no extra properties
  const validProps = [
    'type',
    'view',
    'schema',
    'query',
    'materialized',
    'ifNotExists',
    'orReplace',
  ];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for CREATE_VIEW queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid CREATE_VIEW query, false otherwise
 */
export const isCreateView = <T extends Query<'CREATE_VIEW', any, any>>(
  x: unknown,
): x is T => {
  try {
    assertCreateView(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DROP_VIEW query.
 *
 * Validates all DROP_VIEW-specific properties:
 * - Required: type, view
 * - Optional: schema, ifExists, cascade
 *
 * **Validation Rules**:
 * - `type` must be 'DROP_VIEW'
 * - `view` must be a non-empty string with valid naming
 * - `ifExists` (optional) must be a boolean
 * - `cascade` (optional) must be a boolean
 * - View names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid DROP_VIEW query
 *
 * @example
 * ```ts
 * // Valid DROP_VIEW
 * const query = {
 *   type: 'DROP_VIEW',
 *   view: 'active_users'
 * };
 * assertDropView(query); // ✓ Valid
 *
 * // Valid with cascade
 * const cascadeQuery = {
 *   type: 'DROP_VIEW',
 *   view: 'active_users',
 *   cascade: true
 * };
 * assertDropView(cascadeQuery); // ✓ Valid
 * ```
 */
export const assertDropView = <T extends Query<'DROP_VIEW'>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'DROP_VIEW') {
    throw new TypeError(
      `Invalid DROP_VIEW query: type must be 'DROP_VIEW', got '${x.type}'`,
    );
  }

  // Validate view name exists
  if (!('view' in x) || x.view === null || x.view === undefined) {
    throw new TypeError(
      'Invalid DROP_VIEW query: view name is required',
    );
  }

  // Validate view is a string
  if (typeof x.view !== 'string') {
    throw new TypeError(
      `Invalid DROP_VIEW query: view must be a string, got ${typeof x.view}`,
    );
  }

  // Validate view name is not empty
  if (x.view.trim().length === 0) {
    throw new TypeError(
      'Invalid DROP_VIEW query: view name cannot be empty or whitespace',
    );
  }

  // Validate view name format
  const viewNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!viewNameRegex.test(x.view)) {
    throw new TypeError(
      `Invalid DROP_VIEW query: view name '${x.view}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate view name length
  if (x.view.length > 63) {
    throw new TypeError(
      `Invalid DROP_VIEW query: view name '${x.view}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid DROP_VIEW query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    if (x.schema.trim().length === 0) {
      throw new TypeError(
        'Invalid DROP_VIEW query: schema name cannot be empty or whitespace',
      );
    }
    const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!schemaNameRegex.test(x.schema)) {
      throw new TypeError(
        `Invalid DROP_VIEW query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
      );
    }
    if (x.schema.length > 63) {
      throw new TypeError(
        `Invalid DROP_VIEW query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
      );
    }
  }

  // Validate ifExists if present
  if ('ifExists' in x && x.ifExists !== undefined) {
    if (typeof x.ifExists !== 'boolean') {
      throw new TypeError(
        `Invalid DROP_VIEW query: ifExists must be a boolean, got ${typeof x
          .ifExists}`,
      );
    }
  }

  // Validate cascade if present
  if ('cascade' in x && x.cascade !== undefined) {
    if (typeof x.cascade !== 'boolean') {
      throw new TypeError(
        `Invalid DROP_VIEW query: cascade must be a boolean, got ${typeof x
          .cascade}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = ['type', 'view', 'schema', 'ifExists', 'cascade'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_VIEW query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for DROP_VIEW queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid DROP_VIEW query, false otherwise
 */
export const isDropView = <T extends Query<'DROP_VIEW'>>(
  x: unknown,
): x is T => {
  try {
    assertDropView(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ALTER_VIEW query.
 *
 * Validates all ALTER_VIEW-specific properties:
 * - Required: type, view
 * - Optional: schema, renameTo, query
 * - At least one of renameTo or query must be present
 *
 * **Validation Rules**:
 * - `type` must be 'ALTER_VIEW'
 * - `view` must be a non-empty string with valid naming
 * - `renameTo` (optional) must be a non-empty string with valid naming
 * - `query` (optional) must be a valid SELECT query
 * - View names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid ALTER_VIEW query
 *
 * @example
 * ```ts
 * // Valid ALTER_VIEW - rename
 * const query = {
 *   type: 'ALTER_VIEW',
 *   view: 'active_users',
 *   renameTo: 'current_users'
 * };
 * assertAlterView(query); // ✓ Valid
 *
 * // Valid ALTER_VIEW - change definition
 * const redefineQuery = {
 *   type: 'ALTER_VIEW',
 *   view: 'active_users',
 *   query: { type: 'SELECT', table: 'users', where: { '@status': 'enabled' } }
 * };
 * assertAlterView(redefineQuery); // ✓ Valid
 * ```
 */
export const assertAlterView = <T extends Query<'ALTER_VIEW', any, any>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'ALTER_VIEW') {
    throw new TypeError(
      `Invalid ALTER_VIEW query: type must be 'ALTER_VIEW', got '${x.type}'`,
    );
  }

  // Validate view name exists
  if (!('view' in x) || x.view === null || x.view === undefined) {
    throw new TypeError(
      'Invalid ALTER_VIEW query: view name is required',
    );
  }

  // Validate view is a string
  if (typeof x.view !== 'string') {
    throw new TypeError(
      `Invalid ALTER_VIEW query: view must be a string, got ${typeof x.view}`,
    );
  }

  // Validate view name is not empty
  if (x.view.trim().length === 0) {
    throw new TypeError(
      'Invalid ALTER_VIEW query: view name cannot be empty or whitespace',
    );
  }

  // Validate view name format
  const viewNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!viewNameRegex.test(x.view)) {
    throw new TypeError(
      `Invalid ALTER_VIEW query: view name '${x.view}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate view name length
  if (x.view.length > 63) {
    throw new TypeError(
      `Invalid ALTER_VIEW query: view name '${x.view}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid ALTER_VIEW query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    if (x.schema.trim().length === 0) {
      throw new TypeError(
        'Invalid ALTER_VIEW query: schema name cannot be empty or whitespace',
      );
    }
    const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!schemaNameRegex.test(x.schema)) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
      );
    }
    if (x.schema.length > 63) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
      );
    }
  }

  // Validate renameTo if present
  if ('renameTo' in x && x.renameTo !== undefined) {
    if (typeof x.renameTo !== 'string') {
      throw new TypeError(
        `Invalid ALTER_VIEW query: renameTo must be a string, got ${typeof x
          .renameTo}`,
      );
    }
    if (x.renameTo.trim().length === 0) {
      throw new TypeError(
        'Invalid ALTER_VIEW query: renameTo cannot be empty or whitespace',
      );
    }
    if (!viewNameRegex.test(x.renameTo)) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: renameTo '${x.renameTo}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
      );
    }
    if (x.renameTo.length > 63) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: renameTo '${x.renameTo}' exceeds maximum length of 63 characters`,
      );
    }
  }

  // Validate query if present
  if ('query' in x && x.query !== undefined) {
    try {
      assertSelectQuery(x.query as any);
    } catch (error) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: query must be a valid SELECT query - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Validate that at least one of renameTo or query is present
  if (!('renameTo' in x) && !('query' in x)) {
    throw new TypeError(
      'Invalid ALTER_VIEW query: at least one of renameTo or query must be present',
    );
  }

  // Validate no extra properties
  const validProps = ['type', 'view', 'schema', 'renameTo', 'query'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid ALTER_VIEW query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for ALTER_VIEW queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid ALTER_VIEW query, false otherwise
 */
export const isAlterView = <T extends Query<'ALTER_VIEW', any, any>>(
  x: unknown,
): x is T => {
  try {
    assertAlterView(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid REFRESH_MATERIALIZED_VIEW query.
 *
 * Validates all REFRESH_MATERIALIZED_VIEW-specific properties:
 * - Required: type, view
 * - Optional: schema, concurrently
 *
 * **Validation Rules**:
 * - `type` must be 'REFRESH_MATERIALIZED_VIEW'
 * - `view` must be a non-empty string with valid naming
 * - `concurrently` (optional) must be a boolean
 * - View names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid REFRESH_MATERIALIZED_VIEW query
 *
 * @example
 * ```ts
 * // Valid REFRESH_MATERIALIZED_VIEW
 * const query = {
 *   type: 'REFRESH_MATERIALIZED_VIEW',
 *   view: 'user_stats'
 * };
 * assertRefreshMaterializedView(query); // ✓ Valid
 *
 * // Valid with concurrent refresh
 * const concurrentQuery = {
 *   type: 'REFRESH_MATERIALIZED_VIEW',
 *   view: 'user_stats',
 *   concurrently: true
 * };
 * assertRefreshMaterializedView(concurrentQuery); // ✓ Valid
 * ```
 */
export const assertRefreshMaterializedView = <
  T extends Query<'REFRESH_MATERIALIZED_VIEW'>,
>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'REFRESH_MATERIALIZED_VIEW') {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: type must be 'REFRESH_MATERIALIZED_VIEW', got '${x.type}'`,
    );
  }

  // Validate view name exists
  if (!('view' in x) || x.view === null || x.view === undefined) {
    throw new TypeError(
      'Invalid REFRESH_MATERIALIZED_VIEW query: view name is required',
    );
  }

  // Validate view is a string
  if (typeof x.view !== 'string') {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: view must be a string, got ${typeof x
        .view}`,
    );
  }

  // Validate view name is not empty
  if (x.view.trim().length === 0) {
    throw new TypeError(
      'Invalid REFRESH_MATERIALIZED_VIEW query: view name cannot be empty or whitespace',
    );
  }

  // Validate view name format
  const viewNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!viewNameRegex.test(x.view)) {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: view name '${x.view}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate view name length
  if (x.view.length > 63) {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: view name '${x.view}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate schema if present
  if ('schema' in x && x.schema !== undefined) {
    if (typeof x.schema !== 'string') {
      throw new TypeError(
        `Invalid REFRESH_MATERIALIZED_VIEW query: schema must be a string, got ${typeof x
          .schema}`,
      );
    }
    if (x.schema.trim().length === 0) {
      throw new TypeError(
        'Invalid REFRESH_MATERIALIZED_VIEW query: schema name cannot be empty or whitespace',
      );
    }
    const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!schemaNameRegex.test(x.schema)) {
      throw new TypeError(
        `Invalid REFRESH_MATERIALIZED_VIEW query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
      );
    }
    if (x.schema.length > 63) {
      throw new TypeError(
        `Invalid REFRESH_MATERIALIZED_VIEW query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
      );
    }
  }

  // Validate concurrently if present
  if ('concurrently' in x && x.concurrently !== undefined) {
    if (typeof x.concurrently !== 'boolean') {
      throw new TypeError(
        `Invalid REFRESH_MATERIALIZED_VIEW query: concurrently must be a boolean, got ${typeof x
          .concurrently}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = ['type', 'view', 'schema', 'concurrently'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for REFRESH_MATERIALIZED_VIEW queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid REFRESH_MATERIALIZED_VIEW query, false otherwise
 */
export const isRefreshMaterializedView = <
  T extends Query<'REFRESH_MATERIALIZED_VIEW'>,
>(
  x: unknown,
): x is T => {
  try {
    assertRefreshMaterializedView(x as T);
    return true;
  } catch {
    return false;
  }
};
