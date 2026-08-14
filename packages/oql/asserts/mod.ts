/**
 * @fileoverview OQL Runtime Validators
 *
 * Runtime validation functions for OQL queries, ensuring type safety and
 * correctness at execution time. All validators follow the Guardian pattern:
 * - Assert functions throw TypeError on validation failure
 * - Is functions return boolean without throwing
 *
 * @module asserts
 *
 * @example Validate a SELECT query
 * ```typescript
 * import { assertSelect } from '@tundralibs/oql/asserts';
 *
 * const query = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'email'],
 *   projection: { '@id': true, '@email': true },
 * };
 *
 * try {
 *   assertSelect(query);
 *   console.log('Query is valid');
 * } catch (error) {
 *   console.error('Invalid query:', (error as Error).message);
 * }
 * ```
 *
 * @example Type guard usage
 * ```typescript
 * import { isSelect } from '@tundralibs/oql/asserts';
 *
 * declare const query: unknown;
 *
 * if (isSelect(query)) {
 *   // TypeScript now knows query is SelectQuery
 *   console.log('SELECT from', query.table);
 * }
 * ```
 *
 * @example Validate filters
 * ```typescript
 * import { assertQueryFilter } from '@tundralibs/oql/asserts';
 *
 * const filter = {
 *   '@age': { $gte: 18 },
 *   '@email': { $like: '%@company.com' },
 * };
 *
 * assertQueryFilter(filter, ['age', 'email']);
 * ```
 */

// Main Query Validator (delegates to specific query types)
export { assertQuery, isQuery } from './query/query.ts';

// DML Query Validators
export {
  assertCountQuery as assertCount,
  assertDeleteQuery as assertDelete,
  assertInsertFromQuery,
  assertInsertQuery as assertInsert,
  assertSelectQuery as assertSelect,
  assertUpdateQuery as assertUpdate,
  assertUpsertQuery as assertUpsert,
  isCountQuery as isCount,
  isDeleteQuery as isDelete,
  isInsertFromQuery,
  isInsertQuery as isInsert,
  isSelectQuery as isSelect,
  isUpdateQuery as isUpdate,
  isUpsertQuery as isUpsert,
} from './query/DML/mod.ts';

// DDL Query Validators
export {
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
  isAlterTable,
  isAlterView,
  isCreateIndex,
  isCreateSchema,
  isCreateTable,
  isCreateView,
  isDropIndex,
  isDropSchema,
  isDropTable,
  isDropView,
  isRefreshMaterializedView,
  isTruncate,
} from './query/DDL/mod.ts';

// Filter Validators
export {
  assertExistsFilter,
  assertFilterOperator,
  assertOperators,
  assertQueryFilter,
  isExistsFilter,
  isFilterOperator,
  isOperators,
  isQueryFilter,
} from './filters/mod.ts';

// Join Validators
export {
  assertJoinDetails,
  assertJoinFilter,
  assertJoins,
  isJoinDetails,
  isJoinFilter,
  isJoins,
} from './filters/mod.ts';

// Aggregate Validators
export {
  assertAggregate as assertAggregates,
  assertArrayAggAggregate,
  assertAvgAggregate,
  assertCountAggregate,
  assertJsonRowAggregate,
  assertMaxAggregate,
  assertMinAggregate,
  assertStringAggAggregate,
  assertSumAggregate,
  isAggregate as isAggregates,
  isArrayAggAggregate,
  isAvgAggregate,
  isCountAggregate,
  isJsonRowAggregate,
  isMaxAggregate,
  isMinAggregate,
  isStringAggAggregate,
  isSumAggregate,
} from './aggregates.ts';

// Expression Validators — the category-level guard, plus every per-type
// `assertXxxExpression` / `isXxxExpression`. The per-type guards are
// intended public API (mirroring the per-aggregate guards exported above);
// they were previously reachable only via the sub-module.
export {
  assertExpression as assertExpressions,
  isExpression as isExpressions,
} from './expressions/mod.ts';
export {
  assertAbsExpression,
  assertAddExpression,
  assertCeilExpression,
  assertConcatExpression,
  assertCurrentDateExpression,
  assertCurrentTimeExpression,
  assertCurrentTimestampExpression,
  assertCurrentTimestampTZExpression,
  assertDateAddExpression,
  assertDateDiffExpression,
  assertDateExpression,
  assertDecryptExpression,
  assertDivideExpression,
  assertEncryptExpression,
  assertFloorExpression,
  assertHashExpression,
  assertLengthExpression,
  assertLowerExpression,
  assertLPadExpression,
  assertLTrimExpression,
  assertModuloExpression,
  assertMultiplyExpression,
  assertNowExpression,
  assertNumericExpression,
  assertPowerExpression,
  assertReplaceExpression,
  assertRoundExpression,
  assertRPadExpression,
  assertRTrimExpression,
  assertSqrtExpression,
  assertStringExpression,
  assertSubstrExpression,
  assertSubtractExpression,
  assertTrimExpression,
  assertUpperExpression,
  assertUUIDExpression,
  isAbsExpression,
  isAddExpression,
  isCeilExpression,
  isConcatExpression,
  isCurrentDateExpression,
  isCurrentTimeExpression,
  isCurrentTimestampExpression,
  isCurrentTimestampTZExpression,
  isDateAddExpression,
  isDateDiffExpression,
  isDateExpression,
  isDecryptExpression,
  isDivideExpression,
  isEncryptExpression,
  isFloorExpression,
  isHashExpression,
  isLengthExpression,
  isLowerExpression,
  isLPadExpression,
  isLTrimExpression,
  isModuloExpression,
  isMultiplyExpression,
  isNowExpression,
  isNumericExpression,
  isPowerExpression,
  isReplaceExpression,
  isRoundExpression,
  isRPadExpression,
  isRTrimExpression,
  isSqrtExpression,
  isStringExpression,
  isSubstrExpression,
  isSubtractExpression,
  isTrimExpression,
  isUpperExpression,
  isUUIDExpression,
} from './expressions/mod.ts';

// Column Identifier Validators
export {
  assertColumnIdentifier,
  isColumnIdentifier,
} from './columnIdentifier.ts';

// Query Common Validators
export {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from './query/common.ts';
