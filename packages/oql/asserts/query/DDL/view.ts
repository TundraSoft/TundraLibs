/**
 * View DDL validators: `CREATE_VIEW`, `DROP_VIEW`, `ALTER_VIEW`,
 * `REFRESH_MATERIALIZED_VIEW`.
 *
 * @module asserts/Query/DDL/View
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertSelectQuery } from '../DML/mod.ts';
import { validateIdentifierName } from './common.ts';

const CREATE_VIEW_PROPS = new Set([
  'type',
  'view',
  'schema',
  'query',
  'materialized',
  'ifNotExists',
  'orReplace',
]);
const DROP_VIEW_PROPS = new Set([
  'type',
  'view',
  'schema',
  'materialized',
  'ifExists',
  'cascade',
]);
const ALTER_VIEW_PROPS = new Set([
  'type',
  'view',
  'schema',
  'renameTo',
  'query',
]);
const REFRESH_MV_PROPS = new Set([
  'type',
  'view',
  'schema',
  'concurrently',
]);

/**
 * Asserts that `query.view` exists and is a valid view-name identifier.
 * @internal
 */
const validateViewProp = (
  query: Record<string, unknown>,
  context: string,
): void => {
  if (!('view' in query) || query.view === null || query.view === undefined) {
    throw new TypeError(`Invalid ${context} query: view name is required`);
  }
  if (typeof query.view !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: view must be a string, got ${typeof query
        .view}`,
    );
  }
  validateIdentifierName(query.view, 'view', `${context} query`);
};

/**
 * Asserts that `query.schema`, if present, is a valid schema-name identifier.
 * @internal
 */
const validateOptionalSchema = (
  query: Record<string, unknown>,
  context: string,
): void => {
  if (!('schema' in query) || query.schema === undefined) return;
  if (typeof query.schema !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: schema must be a string, got ${typeof query
        .schema}`,
    );
  }
  validateIdentifierName(query.schema, 'schema', `${context} query`);
};

/**
 * Asserts that `query[propName]`, if present, is a boolean.
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
 * Asserts a value is a valid `CREATE_VIEW` query: `view` is a valid identifier,
 * `query` is a valid SELECT, optional `schema`/`materialized`/`ifNotExists`/
 * `orReplace` are well-typed, and `ifNotExists` and `orReplace` are mutually
 * exclusive (semantically incompatible — replace existing vs. skip if existing).
 */
export const assertCreateView: (
  x: unknown,
) => asserts x is Query<'CREATE_VIEW', TableType, Record<string, TableType>> = (
  x: unknown,
): asserts x is Query<'CREATE_VIEW', TableType, Record<string, TableType>> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'CREATE_VIEW') {
    throw new TypeError(
      `Invalid CREATE_VIEW query: type must be 'CREATE_VIEW', got '${query.type}'`,
    );
  }

  validateViewProp(query, 'CREATE_VIEW');
  validateOptionalSchema(query, 'CREATE_VIEW');

  if (
    !('query' in query) || query.query === null || query.query === undefined
  ) {
    throw new TypeError('Invalid CREATE_VIEW query: query is required');
  }
  try {
    assertSelectQuery(query.query);
  } catch (error) {
    throw new TypeError(
      `Invalid CREATE_VIEW query: query must be a valid SELECT query - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  validateOptionalBoolean(query, 'materialized', 'CREATE_VIEW');
  validateOptionalBoolean(query, 'ifNotExists', 'CREATE_VIEW');
  validateOptionalBoolean(query, 'orReplace', 'CREATE_VIEW');

  if (query.ifNotExists && query.orReplace) {
    throw new TypeError(
      'Invalid CREATE_VIEW query: ifNotExists and orReplace cannot both be true',
    );
  }

  rejectExtraProps(query, CREATE_VIEW_PROPS, 'CREATE_VIEW');
};

/** Type guard for {@link assertCreateView}. */
export const isCreateView = (
  x: unknown,
): x is Query<'CREATE_VIEW', TableType, Record<string, TableType>> => {
  try {
    assertCreateView(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `DROP_VIEW` query: `view` is a valid identifier,
 * optional `schema` is a valid identifier, and optional `ifExists`/`cascade`
 * are booleans.
 */
export const assertDropView: (
  x: unknown,
) => asserts x is Query<'DROP_VIEW'> = (
  x: unknown,
): asserts x is Query<'DROP_VIEW'> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DROP_VIEW query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'DROP_VIEW') {
    throw new TypeError(
      `Invalid DROP_VIEW query: type must be 'DROP_VIEW', got '${query.type}'`,
    );
  }

  validateViewProp(query, 'DROP_VIEW');
  validateOptionalSchema(query, 'DROP_VIEW');
  validateOptionalBoolean(query, 'materialized', 'DROP_VIEW');
  validateOptionalBoolean(query, 'ifExists', 'DROP_VIEW');
  validateOptionalBoolean(query, 'cascade', 'DROP_VIEW');
  rejectExtraProps(query, DROP_VIEW_PROPS, 'DROP_VIEW');
};

/** Type guard for {@link assertDropView}. */
export const isDropView = (
  x: unknown,
): x is Query<'DROP_VIEW'> => {
  try {
    assertDropView(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `ALTER_VIEW` query: `view` is a valid identifier,
 * optional `schema` is a valid identifier, optional `renameTo` is a valid
 * view-name identifier, optional `query` is a valid SELECT, and at least one
 * of `renameTo` or `query` must be present (an empty ALTER is meaningless).
 */
export const assertAlterView: (
  x: unknown,
) => asserts x is Query<'ALTER_VIEW', TableType, Record<string, TableType>> = (
  x: unknown,
): asserts x is Query<'ALTER_VIEW', TableType, Record<string, TableType>> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid ALTER_VIEW query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'ALTER_VIEW') {
    throw new TypeError(
      `Invalid ALTER_VIEW query: type must be 'ALTER_VIEW', got '${query.type}'`,
    );
  }

  validateViewProp(query, 'ALTER_VIEW');
  validateOptionalSchema(query, 'ALTER_VIEW');

  if ('renameTo' in query && query.renameTo !== undefined) {
    if (typeof query.renameTo !== 'string') {
      throw new TypeError(
        `Invalid ALTER_VIEW query: renameTo must be a string, got ${typeof query
          .renameTo}`,
      );
    }
    validateIdentifierName(query.renameTo, 'view', 'ALTER_VIEW query');
  }

  if ('query' in query && query.query !== undefined) {
    try {
      assertSelectQuery(query.query);
    } catch (error) {
      throw new TypeError(
        `Invalid ALTER_VIEW query: query must be a valid SELECT query - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (!('renameTo' in query) && !('query' in query)) {
    throw new TypeError(
      'Invalid ALTER_VIEW query: at least one of renameTo or query must be present',
    );
  }

  rejectExtraProps(query, ALTER_VIEW_PROPS, 'ALTER_VIEW');
};

/** Type guard for {@link assertAlterView}. */
export const isAlterView = (
  x: unknown,
): x is Query<'ALTER_VIEW', TableType, Record<string, TableType>> => {
  try {
    assertAlterView(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts a value is a valid `REFRESH_MATERIALIZED_VIEW` query: `view` is a
 * valid identifier, optional `schema` is a valid identifier, optional
 * `concurrently` is a boolean.
 */
export const assertRefreshMaterializedView: (
  x: unknown,
) => asserts x is Query<'REFRESH_MATERIALIZED_VIEW'> = (
  x: unknown,
): asserts x is Query<'REFRESH_MATERIALIZED_VIEW'> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  if (query.type !== 'REFRESH_MATERIALIZED_VIEW') {
    throw new TypeError(
      `Invalid REFRESH_MATERIALIZED_VIEW query: type must be 'REFRESH_MATERIALIZED_VIEW', got '${query.type}'`,
    );
  }

  validateViewProp(query, 'REFRESH_MATERIALIZED_VIEW');
  validateOptionalSchema(query, 'REFRESH_MATERIALIZED_VIEW');
  validateOptionalBoolean(query, 'concurrently', 'REFRESH_MATERIALIZED_VIEW');
  rejectExtraProps(query, REFRESH_MV_PROPS, 'REFRESH_MATERIALIZED_VIEW');
};

/** Type guard for {@link assertRefreshMaterializedView}. */
export const isRefreshMaterializedView = (
  x: unknown,
): x is Query<'REFRESH_MATERIALIZED_VIEW'> => {
  try {
    assertRefreshMaterializedView(x);
    return true;
  } catch {
    return false;
  }
};
