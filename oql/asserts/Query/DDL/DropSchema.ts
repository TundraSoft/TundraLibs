/**
 * DROP_SCHEMA Query Validator
 *
 * This module provides validation for DROP SCHEMA queries in OQL.
 * DROP SCHEMA queries remove an existing database schema/namespace.
 * Supports optional CASCADE to drop all contained objects.
 *
 * @module asserts/Query/DDL/DropSchema
 */

import type { Query } from '../../../types/mod.ts';

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
      `Invalid DROP_SCHEMA query: schema must be a string, got ${typeof x.schema}`,
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
        `Invalid DROP_SCHEMA query: cascade must be a boolean, got ${typeof x.cascade}`,
      );
    }
  }

  // Validate no extra properties
  const validProps = ['type', 'schema', 'cascade'];
  const extraProps = Object.keys(x).filter((key) => !validProps.includes(key));
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: unexpected properties: ${extraProps.join(', ')}`,
    );
  }
};
