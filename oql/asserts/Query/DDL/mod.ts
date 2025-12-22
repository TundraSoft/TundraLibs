/**
 * DDL (Data Definition Language) Query Validators
 *
 * This module exports all DDL query validators for schema, table, and view operations.
 *
 * @module asserts/Query/DDL
 */

export {
  assertCreateSchema,
  assertDropSchema,
  isCreateSchema,
  isDropSchema,
} from './Schema.ts';
export {
  assertAlterTable,
  assertCreateTable,
  assertDropTable,
  isAlterTable,
  isCreateTable,
  isDropTable,
} from './Table.ts';
export {
  assertAlterView,
  assertCreateView,
  assertDropView,
  assertRefreshMaterializedView,
  isAlterView,
  isCreateView,
  isDropView,
  isRefreshMaterializedView,
} from './View.ts';
