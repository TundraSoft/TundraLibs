/**
 * ExistsFilter Validators
 *
 * Validation for the `$exists` / `$nexists` correlated-subquery filter
 * shape: `{ table, schema?, on, where? }`. Wired into
 * {@link assertQueryFilter} which dispatches `$exists` / `$nexists`
 * keys here.
 *
 * @module asserts/Filters/Exists
 */

import type { ExistsFilter, TableType } from '../../types/mod.ts';
import { assertColumnIdentifier } from '../columnIdentifier.ts';
import { assertQueryFilter } from './filterOperator.ts';

/**
 * Default maximum nesting depth — matches the QueryFilter validator's
 * limit so `$exists.where` recursion counts against the same budget.
 *
 * @internal
 */
const MAX_EXISTS_FILTER_DEPTH = 10;

/**
 * Validate one entry of the `on` correlation map. The KEY must be a
 * single-segment `@column` identifier (a column of the subquery table
 * — the internal `__exists__` alias is implicit, so alias-qualified
 * keys are rejected). The VALUE must be `null`, a primitive, a `Date`,
 * or a string (outer column ref like `'@id'` / `'@Alias.@col'`, or a
 * literal). Expression objects are rejected: their embedded column
 * refs cannot be qualified reliably inside the subquery.
 *
 * @internal
 */
const validateOnEntry = (key: string, value: unknown): void => {
  try {
    assertColumnIdentifier(key);
  } catch (error) {
    throw new TypeError(
      `Invalid ExistsFilter: 'on' key '${key}' is not a valid column identifier - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (key.includes('.')) {
    throw new TypeError(
      `Invalid ExistsFilter: 'on' key '${key}' must be a single-segment '@column' reference into the subquery table (no alias prefix)`,
    );
  }

  if (value === null) return;
  if (
    typeof value === 'string' || typeof value === 'number' ||
    typeof value === 'boolean' || typeof value === 'bigint' ||
    value instanceof Date
  ) {
    return;
  }
  if (
    typeof value === 'object' && !Array.isArray(value) &&
    '$$_expression' in value
  ) {
    throw new TypeError(
      `Invalid ExistsFilter: 'on' value for key '${key}' cannot be an expression — correlate through column references or literals only`,
    );
  }
  throw new TypeError(
    `Invalid ExistsFilter: 'on' value for key '${key}' must be null, a primitive value, a Date, or a column identifier, got ${typeof value}`,
  );
};

/**
 * Asserts that a value is a valid ExistsFilter — the `$exists` /
 * `$nexists` payload of a QueryFilter.
 *
 * Shape rules:
 * - `table`: required non-empty string.
 * - `schema`: optional non-empty string.
 * - `on`: required non-empty object; keys are single-segment `@column`
 *   refs into the subquery table; values are outer column refs or
 *   literal primitives (see {@link validateOnEntry}).
 * - `where`: optional QueryFilter over the subquery table's columns
 *   (validated without a column list — the subquery table's schema is
 *   not declared).
 *
 * @param x - The value to validate
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @throws {TypeError} If the value is not a valid ExistsFilter
 *
 * @example
 * ```ts
 * assertExistsFilter({
 *   table: 'orders',
 *   on: { '@userId': '@id' },
 *   where: { '@status': 'paid' },
 * });
 * ```
 */
export const assertExistsFilter: <PT extends TableType = TableType>(
  x: unknown,
  depth?: number,
  maxDepth?: number,
) => asserts x is ExistsFilter<PT> = <PT extends TableType = TableType>(
  x: unknown,
  depth = 0,
  maxDepth = MAX_EXISTS_FILTER_DEPTH,
): asserts x is ExistsFilter<PT> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid ExistsFilter: Expected an object, got ${
        Array.isArray(x) ? 'array' : typeof x
      }`,
    );
  }

  const obj = x as Record<string, unknown>;

  if (!('table' in obj)) {
    throw new TypeError(
      `Invalid ExistsFilter: Missing required 'table' property`,
    );
  }
  if (typeof obj.table !== 'string' || obj.table.trim().length === 0) {
    throw new TypeError(
      `Invalid ExistsFilter: 'table' must be a non-empty string, got ${typeof obj
        .table}`,
    );
  }

  if ('schema' in obj && obj.schema !== undefined) {
    if (typeof obj.schema !== 'string' || obj.schema.trim().length === 0) {
      throw new TypeError(
        `Invalid ExistsFilter: 'schema' must be a non-empty string, got ${typeof obj
          .schema}`,
      );
    }
  }

  if (!('on' in obj)) {
    throw new TypeError(`Invalid ExistsFilter: Missing required 'on' property`);
  }
  if (typeof obj.on !== 'object' || obj.on === null || Array.isArray(obj.on)) {
    throw new TypeError(
      `Invalid ExistsFilter: 'on' must be an object, got ${
        Array.isArray(obj.on) ? 'array' : typeof obj.on
      }`,
    );
  }
  const on = obj.on as Record<string, unknown>;
  if (Object.keys(on).length === 0) {
    throw new TypeError(`Invalid ExistsFilter: 'on' cannot be empty`);
  }
  for (const [key, value] of Object.entries(on)) {
    validateOnEntry(key, value);
  }

  if ('where' in obj && obj.where !== undefined) {
    try {
      // No column list — the subquery table's columns are not declared,
      // so only structural validity is checked. Keys resolve against
      // the subquery table at translate time.
      assertQueryFilter(obj.where, undefined, depth + 1, maxDepth);
    } catch (error) {
      throw new TypeError(
        `Invalid ExistsFilter: 'where' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};

/**
 * Type guard for ExistsFilter.
 *
 * @param x - The value to check
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @returns True if the value is a valid ExistsFilter, false otherwise
 */
export const isExistsFilter: <PT extends TableType = TableType>(
  x: unknown,
  depth?: number,
  maxDepth?: number,
) => x is ExistsFilter<PT> = <PT extends TableType = TableType>(
  x: unknown,
  depth = 0,
  maxDepth = MAX_EXISTS_FILTER_DEPTH,
): x is ExistsFilter<PT> => {
  try {
    assertExistsFilter<PT>(x, depth, maxDepth);
    return true;
  } catch {
    return false;
  }
};
