/**
 * Top-level query validator that dispatches to a type-specific validator
 * (DML or DDL) based on the `type` discriminator.
 *
 * @module asserts/Query/Query
 */

import type { Query, QueryTypes, TableType } from '../../types/mod.ts';
import {
  assertCountQuery,
  assertDeleteQuery,
  assertInsertFromQuery,
  assertInsertQuery,
  assertSelectQuery,
  assertUpdateQuery,
  assertUpsertQuery,
} from './DML/mod.ts';
import {
  assertAlterTable,
  assertAlterView,
  assertCreateIndex,
  assertCreateSchema,
  assertCreateTable,
  assertCreateView,
  assertDropIndex,
  assertDropSchema,
  assertDropTable,
  assertDropView,
  assertRefreshMaterializedView,
  assertTruncate,
} from './DDL/mod.ts';

/**
 * Asserts a value is a valid `Query` of any supported type. Validates the
 * top-level shape (object with string `type`) then delegates to the matching
 * DML/DDL validator. Adding a new query type only requires extending
 * `QueryTypes` and adding a switch case below — the function signature
 * itself parameterises on `QueryTypes` and needs no edit.
 */
export const assertQuery: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
) => asserts x is Query<QueryTypes, PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
): asserts x is Query<QueryTypes, PT, LT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(`Invalid Query: Expected object, got ${typeof x}`);
  }

  const query = x as Record<string, unknown>;

  if (typeof query.type !== 'string') {
    throw new TypeError(
      `Invalid Query: Expected 'type' property to be a string`,
    );
  }

  switch (query.type) {
    // DML
    case 'SELECT':
      assertSelectQuery<PT, LT>(x);
      return;
    case 'INSERT':
      assertInsertQuery<PT>(x);
      return;
    case 'INSERT_FROM_QUERY':
      assertInsertFromQuery<PT>(x);
      return;
    case 'UPDATE':
      assertUpdateQuery<PT>(x);
      return;
    case 'DELETE':
      assertDeleteQuery<PT>(x);
      return;
    case 'UPSERT':
      assertUpsertQuery<PT>(x);
      return;
    case 'COUNT':
      assertCountQuery<PT>(x);
      return;

    // DDL — Table
    case 'CREATE_TABLE':
      assertCreateTable(x);
      return;
    case 'ALTER_TABLE':
      assertAlterTable(x);
      return;
    case 'DROP_TABLE':
      assertDropTable(x);
      return;
    case 'TRUNCATE':
      assertTruncate(x);
      return;

    // DDL — Schema
    case 'CREATE_SCHEMA':
      assertCreateSchema(x);
      return;
    case 'DROP_SCHEMA':
      assertDropSchema(x);
      return;

    // DDL — Index
    case 'CREATE_INDEX':
      assertCreateIndex(x);
      return;
    case 'DROP_INDEX':
      assertDropIndex(x);
      return;

    // DDL — View
    case 'CREATE_VIEW':
      assertCreateView(x);
      return;
    case 'ALTER_VIEW':
      assertAlterView(x);
      return;
    case 'DROP_VIEW':
      assertDropView(x);
      return;
    case 'REFRESH_MATERIALIZED_VIEW':
      assertRefreshMaterializedView(x);
      return;

    default:
      throw new TypeError(
        `Invalid Query: Unknown query type '${query.type}'`,
      );
  }
};

/** Type guard for {@link assertQuery}. */
export const isQuery = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
): x is Query<QueryTypes, PT, LT> => {
  try {
    assertQuery<PT, LT>(x);
    return true;
  } catch {
    return false;
  }
};
