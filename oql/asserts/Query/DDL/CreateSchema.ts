/**
 * CREATE_SCHEMA Query Validator
 *
 * This module provides validation for CREATE SCHEMA queries in OQL.
 * CREATE SCHEMA queries create a new database schema/namespace for organizing tables,
 * views, and other database objects.
 *
 * @module asserts/Query/DDL/CreateSchema
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
      `Invalid CREATE_SCHEMA query: schema must be a string, got ${typeof x.schema}`,
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
      `Invalid CREATE_SCHEMA query: unexpected properties: ${extraProps.join(', ')}`,
    );
  }
};
