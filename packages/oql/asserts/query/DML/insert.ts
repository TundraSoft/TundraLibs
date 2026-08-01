/**
 * `INSERT` query validator.
 *
 * @module asserts/Query/DML/Insert
 */

import type { Query, TableType } from '../../../types/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateDataEntry } from './common.ts';

/**
 * Asserts a value is a valid `INSERT` query: `table` and `columns` are valid,
 * optional `schema` is valid, and `data` is a non-empty object (or array of
 * non-empty objects). Each data entry's key must be in `columns`; each value
 * must be a primitive, `Date`, `null`, or an `Expression` that does NOT
 * contain `@col` references (an INSERT row has no other rows to reference).
 */
export const assertInsertQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'INSERT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'INSERT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid INSERT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'INSERT', 'INSERT');
  assertTableName(query, 'INSERT');
  assertSchemaName(query, 'INSERT');
  const columnList = assertColumns(query, 'INSERT');

  if (query.data === undefined || query.data === null) {
    throw new TypeError(`Invalid INSERT query: 'data' is required`);
  }

  const dataArray = Array.isArray(query.data) ? query.data : [query.data];

  if (dataArray.length === 0) {
    throw new TypeError(
      `Invalid INSERT query: 'data' cannot be an empty array`,
    );
  }

  for (let i = 0; i < dataArray.length; i++) {
    const dataObj = dataArray[i];

    if (typeof dataObj !== 'object' || dataObj === null) {
      throw new TypeError(
        `Invalid INSERT query: data[${i}] must be an object`,
      );
    }

    const data = dataObj as Record<string, unknown>;
    if (Object.keys(data).length === 0) {
      throw new TypeError(`Invalid INSERT query: data[${i}] cannot be empty`);
    }

    for (const [key, value] of Object.entries(data)) {
      validateDataEntry(
        key,
        value,
        columnList,
        `INSERT query: data[${i}]`,
        { allowColumnReferences: false },
      );
    }
  }
};

/** Type guard for {@link assertInsertQuery}. */
export const isInsertQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'INSERT', PT> => {
  try {
    assertInsertQuery(x);
    return true;
  } catch {
    return false;
  }
};
