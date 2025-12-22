/**
 * DML Query Validators
 *
 * This module exports all Data Manipulation Language (DML) query validators.
 * DML queries operate on data within existing database structures.
 *
 * @module asserts/Query/DML
 */

export { assertSelectQuery, isSelectQuery } from './Select.ts';
export { assertInsertQuery, isInsertQuery } from './Insert.ts';
export { assertUpdateQuery, isUpdateQuery } from './Update.ts';
export { assertUpsertQuery, isUpsertQuery } from './Upsert.ts';
export { assertDeleteQuery, isDeleteQuery } from './Delete.ts';
export { assertCountQuery, isCountQuery } from './Count.ts';
