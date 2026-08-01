/**
 * Schema-level DDL validators: `CREATE_SCHEMA`, `DROP_SCHEMA`.
 *
 * @module asserts/Query/DDL/Schema
 */

import type { Query } from '../../../types/mod.ts';
import { validateIdentifierName } from './common.ts';

const CREATE_SCHEMA_PROPS = new Set(['type', 'schema']);
const DROP_SCHEMA_PROPS = new Set(['type', 'schema', 'cascade']);

/**
 * Asserts a value is a valid `CREATE_SCHEMA` query: `type === 'CREATE_SCHEMA'`
 * and `schema` is a valid identifier. No other properties are allowed.
 */
export const assertCreateSchema: (
  x: unknown,
) => asserts x is Query<'CREATE_SCHEMA'> = (
  x: unknown,
): asserts x is Query<'CREATE_SCHEMA'> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'CREATE_SCHEMA') {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: type must be 'CREATE_SCHEMA', got '${query.type}'`,
    );
  }

  if (
    !('schema' in query) || query.schema === null || query.schema === undefined
  ) {
    throw new TypeError(
      'Invalid CREATE_SCHEMA query: schema name is required',
    );
  }
  if (typeof query.schema !== 'string') {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: schema must be a string, got ${typeof query
        .schema}`,
    );
  }
  validateIdentifierName(query.schema, 'schema', 'CREATE_SCHEMA query');

  const extraProps = Object.keys(query).filter(
    (key) => !CREATE_SCHEMA_PROPS.has(key),
  );
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid CREATE_SCHEMA query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/** Type guard for {@link assertCreateSchema}. */
export const isCreateSchema = (
  x: unknown,
): x is Query<'CREATE_SCHEMA'> => {
  try {
    assertCreateSchema(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `DROP_SCHEMA` query: `type === 'DROP_SCHEMA'`
 * and `schema` is a valid identifier. `cascade` is optional and must be a
 * boolean if present.
 */
export const assertDropSchema: (
  x: unknown,
) => asserts x is Query<'DROP_SCHEMA'> = (
  x: unknown,
): asserts x is Query<'DROP_SCHEMA'> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'DROP_SCHEMA') {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: type must be 'DROP_SCHEMA', got '${query.type}'`,
    );
  }

  if (
    !('schema' in query) || query.schema === null || query.schema === undefined
  ) {
    throw new TypeError(
      'Invalid DROP_SCHEMA query: schema name is required',
    );
  }
  if (typeof query.schema !== 'string') {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: schema must be a string, got ${typeof query
        .schema}`,
    );
  }
  validateIdentifierName(query.schema, 'schema', 'DROP_SCHEMA query');

  if ('cascade' in query && typeof query.cascade !== 'boolean') {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: cascade must be a boolean, got ${typeof query
        .cascade}`,
    );
  }

  const extraProps = Object.keys(query).filter(
    (key) => !DROP_SCHEMA_PROPS.has(key),
  );
  if (extraProps.length > 0) {
    throw new TypeError(
      `Invalid DROP_SCHEMA query: unexpected properties: ${
        extraProps.join(', ')
      }`,
    );
  }
};

/** Type guard for {@link assertDropSchema}. */
export const isDropSchema = (
  x: unknown,
): x is Query<'DROP_SCHEMA'> => {
  try {
    assertDropSchema(x);
    return true;
  } catch {
    return false;
  }
};
