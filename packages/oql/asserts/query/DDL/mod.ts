/**
 * DDL (Data Definition Language) Query Validators
 *
 * This module exports all DDL query validators for schema, table, index, and view operations.
 *
 * @module asserts/Query/DDL
 */

export {
  assertCreateSchema,
  assertDropSchema,
  isCreateSchema,
  isDropSchema,
} from './schema.ts';
export {
  assertAlterTable,
  assertCreateTable,
  assertDropTable,
  assertTruncate,
  isAlterTable,
  isCreateTable,
  isDropTable,
  isTruncate,
} from './table.ts';
export {
  assertCreateIndex,
  assertDropIndex,
  isCreateIndex,
  isDropIndex,
} from './index.ts';
export {
  assertAlterView,
  assertCreateView,
  assertDropView,
  assertRefreshMaterializedView,
  isAlterView,
  isCreateView,
  isDropView,
  isRefreshMaterializedView,
} from './view.ts';
