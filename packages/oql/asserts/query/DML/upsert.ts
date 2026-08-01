/**
 * `UPSERT` query validator. Insert-or-update keyed by `conflictKeys`, with
 * optional partial-update column list `updateOnConflict`.
 *
 * @module asserts/Query/DML/Upsert
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertColumnIdentifier } from '../../columnIdentifier.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateDataEntry } from './common.ts';

/**
 * Validates `conflictKeys`: a non-empty array of column identifiers
 * (`@col` strings) referencing declared columns.
 *
 * @internal
 */
const validateConflictKeys = (
  conflictKeys: unknown,
  columnList: string[],
): void => {
  if (!Array.isArray(conflictKeys) || conflictKeys.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'conflictKeys' must be a non-empty array`,
    );
  }

  for (const key of conflictKeys) {
    try {
      assertColumnIdentifier(key, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid UPSERT query: conflictKeys - ${(error as Error).message}`,
      );
    }
  }
};

/**
 * Validates `updateOnConflict`: a non-empty array of column identifiers,
 * disjoint from `conflictKeys` (no point updating the columns you matched
 * on), and each must be present in the supplied data row.
 *
 * @internal
 */
const validateUpdateOnConflict = (
  updateOnConflict: unknown,
  conflictKeys: string[],
  columnList: string[],
  firstData: unknown,
): void => {
  if (!Array.isArray(updateOnConflict)) {
    throw new TypeError(
      `Invalid UPSERT query: 'updateOnConflict' must be an array if provided`,
    );
  }
  if (updateOnConflict.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'updateOnConflict' cannot be an empty array`,
    );
  }

  const dataKeys = typeof firstData === 'object' && firstData !== null
    ? Object.keys(firstData as Record<string, unknown>)
    : [];

  for (const identifier of updateOnConflict) {
    try {
      assertColumnIdentifier(identifier, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid UPSERT query: updateOnConflict - ${(error as Error).message}`,
      );
    }

    if (conflictKeys.includes(identifier as string)) {
      throw new TypeError(
        `Invalid UPSERT query: updateOnConflict should not include conflictKey '${identifier}'`,
      );
    }

    const columnName = (identifier as string).slice(1);
    if (!dataKeys.includes(columnName)) {
      throw new TypeError(
        `Invalid UPSERT query: updateOnConflict column '${identifier}' (${columnName}) must exist in data`,
      );
    }
  }
};

/**
 * Validates a single UPSERT data row: must be a non-empty plain object whose
 * entries are valid via `validateDataEntry`.
 *
 * @internal
 */
const validateDataObject = (
  dataObj: unknown,
  index: number | string,
  label: string,
  columnList: string[],
): void => {
  if (typeof dataObj !== 'object' || dataObj === null) {
    throw new TypeError(
      `Invalid UPSERT query: ${label}[${index}] must be an object`,
    );
  }

  const data = dataObj as Record<string, unknown>;
  if (Object.keys(data).length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: ${label}[${index}] cannot be empty`,
    );
  }

  for (const [key, value] of Object.entries(data)) {
    validateDataEntry(
      key,
      value,
      columnList,
      `UPSERT query: ${label}[${index}]`,
    );
  }
};

/**
 * Asserts a value is a valid `UPSERT` query: `table` and `columns` are
 * valid, optional `schema` is valid, `data` is a non-empty object (or array
 * of non-empty objects), `conflictKeys` is a non-empty array of declared
 * columns, and optional `updateOnConflict` lists columns disjoint from
 * `conflictKeys` that exist in the supplied data.
 */
export const assertUpsertQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'UPSERT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'UPSERT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid UPSERT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'UPSERT', 'UPSERT');
  assertTableName(query, 'UPSERT');
  assertSchemaName(query, 'UPSERT');
  const columnList = assertColumns(query, 'UPSERT');

  if (query.data === undefined || query.data === null) {
    throw new TypeError(`Invalid UPSERT query: 'data' is required`);
  }

  const dataArray = Array.isArray(query.data) ? query.data : [query.data];

  if (dataArray.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'data' cannot be an empty array`,
    );
  }

  for (let i = 0; i < dataArray.length; i++) {
    validateDataObject(dataArray[i], i, 'data', columnList);
  }

  validateConflictKeys(query.conflictKeys, columnList);

  if (query.updateOnConflict !== undefined) {
    const firstData = Array.isArray(query.data) ? query.data[0] : query.data;
    validateUpdateOnConflict(
      query.updateOnConflict,
      query.conflictKeys as string[],
      columnList,
      firstData,
    );
  }
};

/** Type guard for {@link assertUpsertQuery}. */
export const isUpsertQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'UPSERT', PT> => {
  try {
    assertUpsertQuery(x);
    return true;
  } catch {
    return false;
  }
};
