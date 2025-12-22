/**
 * Schema Query Validators
 *
 * This module provides validation for schema-related DDL queries in OQL:
 * - CREATE_SCHEMA: Create a new database schema/namespace
 * - DROP_SCHEMA: Remove an existing database schema
 *
 * @module asserts/Query/DDL/Schema
 */

import type { Query } from '../../../types/mod.ts';

/**
 * Asserts that a value is a valid CREATE_SCHEMA query.
 *
 * Validates all CREATE_SCHEMA-specific properties:
 * - Required: type, schema
 *
 * **Validation Rules**:
 * - `type` must be 'CREATE_SCHEMA'
 * - `schema` must be a non-empty string with valid naming
 * - Schema names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CREATE_SCHEMA query
 *
 * @example
 * ```ts
 * // Valid CREATE_SCHEMA
 * const query = {
 *   type: 'CREATE_SCHEMA',
 *   schema: 'analytics'
 * };
 * assertCreateSchema(query); // ✓ Valid
 *
 * // Invalid - empty schema name
 * const invalid = {
 *   type: 'CREATE_SCHEMA',
 *   schema: ''
 * };
 * assertCreateSchema(invalid); // ✗ Throws TypeError
 * ```
 */
export const assertCreateSchema = <T extends Query<'CREATE_SCHEMA'>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'CREATE_SCHEMA') {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: type must be 'CREATE_SCHEMA', got '${x.type}'`,
    );
  }

  // Validate schema name exists
  if (!('schema' in x) || x.schema === null || x.schema === undefined) {
    throw new TypeError(
      'Invalid CREATE_SCHEMA query: schema name is required',
    );
  }

  // Validate schema is a string
  if (typeof x.schema !== 'string') {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: schema must be a string, got ${typeof x
        .schema}`,
    );
  }

  // Validate schema name is not empty
  if (x.schema.trim().length === 0) {
    throw new TypeError(
      'Invalid CREATE_SCHEMA query: schema name cannot be empty or whitespace',
    );
  }

  // Validate schema name format (alphanumeric, underscores, cannot start with number)
  const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!schemaNameRegex.test(x.schema)) {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate schema name length (reasonable limit)
  if (x.schema.length > 63) {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate no extra properties
  const validProps = ['type', 'schema'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for CREATE_SCHEMA queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid CREATE_SCHEMA query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'CREATE_SCHEMA', schema: 'analytics' };
 * if (isCreateSchema(query)) {
 *   // query is now typed as Query<'CREATE_SCHEMA'>
 *   console.log(query.schema);
 * }
 * ```
 */
export const isCreateSchema = <T extends Query<'CREATE_SCHEMA'>>(
  x: unknown,
): x is T => {
  try {
    assertCreateSchema(x as T);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DROP_SCHEMA query.
 *
 * Validates all DROP_SCHEMA-specific properties:
 * - Required: type, schema
 * - Optional: cascade
 *
 * **Validation Rules**:
 * - `type` must be 'DROP_SCHEMA'
 * - `schema` must be a non-empty string with valid naming
 * - `cascade` (optional) must be a boolean
 * - Schema names cannot contain special characters except underscores
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid DROP_SCHEMA query
 *
 * @example
 * ```ts
 * // Valid DROP_SCHEMA without cascade
 * const query = {
 *   type: 'DROP_SCHEMA',
 *   schema: 'analytics'
 * };
 * assertDropSchema(query); // ✓ Valid
 *
 * // Valid DROP_SCHEMA with cascade
 * const cascadeQuery = {
 *   type: 'DROP_SCHEMA',
 *   schema: 'analytics',
 *   cascade: true
 * };
 * assertDropSchema(cascadeQuery); // ✓ Valid
 *
 * // Invalid - empty schema name
 * const invalid = {
 *   type: 'DROP_SCHEMA',
 *   schema: ''
 * };
 * assertDropSchema(invalid); // ✗ Throws TypeError
 * ```
 */
export const assertDropSchema = <T extends Query<'DROP_SCHEMA'>>(
  x: T,
): void => {
  // Validate type
  if (x.type !== 'DROP_SCHEMA') {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: type must be 'DROP_SCHEMA', got '${x.type}'`,
    );
  }

  // Validate schema name exists
  if (!('schema' in x) || x.schema === null || x.schema === undefined) {
    throw new TypeError(
      'Invalid DROP_SCHEMA query: schema name is required',
    );
  }

  // Validate schema is a string
  if (typeof x.schema !== 'string') {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: schema must be a string, got ${typeof x
        .schema}`,
    );
  }

  // Validate schema name is not empty
  if (x.schema.trim().length === 0) {
    throw new TypeError(
      'Invalid DROP_SCHEMA query: schema name cannot be empty or whitespace',
    );
  }

  // Validate schema name format (alphanumeric, underscores, cannot start with number)
  const schemaNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!schemaNameRegex.test(x.schema)) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: schema name '${x.schema}' must start with a letter or underscore and contain only alphanumeric characters and underscores`,
    );
  }

  // Validate schema name length (reasonable limit)
  if (x.schema.length > 63) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: schema name '${x.schema}' exceeds maximum length of 63 characters`,
    );
  }

  // Validate cascade if present
  if ('cascade' in x) {
    if (typeof x.cascade !== 'boolean') {
      throw new TypeError(
        `Invalid DROP_SCHEMA query: cascade must be a boolean, got ${typeof x
          .cascade}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = ['type', 'schema', 'cascade'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/**
 * Type guard for DROP_SCHEMA queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid DROP_SCHEMA query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'DROP_SCHEMA', schema: 'analytics', cascade: true };
 * if (isDropSchema(query)) {
 *   // query is now typed as Query<'DROP_SCHEMA'>
 *   console.log(query.schema);
 * }
 * ```
 */
export const isDropSchema = <T extends Query<'DROP_SCHEMA'>>(
  x: unknown,
): x is T => {
  try {
    assertDropSchema(x as T);
    return true;
  } catch {
    return false;
  }
};
