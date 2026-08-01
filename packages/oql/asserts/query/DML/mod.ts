/**
 * DML Query Validators
 *
 * This module exports all Data Manipulation Language (DML) query validators.
 * DML queries operate on data within existing database structures.
 *
 * @module asserts/Query/DML
 */

export { assertSelectQuery, isSelectQuery } from './select.ts';
export { assertInsertQuery, isInsertQuery } from './insert.ts';
export { assertInsertFromQuery, isInsertFromQuery } from './insertFromQuery.ts';
export { assertUpdateQuery, isUpdateQuery } from './update.ts';
export { assertUpsertQuery, isUpsertQuery } from './upsert.ts';
export { assertDeleteQuery, isDeleteQuery } from './delete.ts';
export { assertCountQuery, isCountQuery } from './count.ts';
