/**
 * @fileoverview OQL Type Definitions
 *
 * Comprehensive TypeScript types for database queries, filters, expressions,
 * and aggregates. All types are fully generic and support custom table schemas
 * with complete type inference.
 *
 * @module types
 *
 * @example Define a query with type safety
 * ```typescript
 * import type { Query, QueryFilter } from '@tundralibs/oql';
 *
 * type User = {
 *   id: number;
 *   email: string;
 *   age: number;
 * };
 *
 * const query: Query<'SELECT', User> = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'email', 'age'],
 *   projection: {
 *     '@id': 'userId',
 *     '@email': 'userEmail',
 *   },
 *   where: {
 *     '@age': { $gte: 18 },
 *   },
 * };
 * ```
 *
 * @example Complex filters
 * ```typescript
 * import type { QueryFilter } from '@tundralibs/oql';
 *
 * type User = { age: number; verified: boolean; email: string };
 *
 * const filter: QueryFilter<User> = {
 *   $or: [
 *     { '@age': { $gte: 18, $lt: 65 } },
 *     { '@verified': true },
 *   ],
 *   '@email': { $like: '%@company.com' },
 * };
 * ```
 */

// Single barrel over the `common/`, `filter/`, `expressions/`,
// `aggregates/`, and `query/` sub-folders. Each type lives in its
// own file underneath; the per-domain `mod.ts` barrels exist for
// fine-grained sub-path imports.

// common/
export type { ColumnIdentifier } from './common/ColumnIdentifier.ts';
export type { ColumnTypes } from './common/ColumnTypes.ts';
export type { ForeignKeyAction } from './common/ForeignKeyAction.ts';
export type { ForeignKeyConstraint } from './common/ForeignKeyConstraint.ts';
export type { GetColumnByType } from './common/GetColumnByType.ts';
export type { IndexMethod } from './common/IndexMethod.ts';
export type { SQLDataType } from './common/SQLDataType.ts';
export type { SQLTypes } from './common/SQLTypes.ts';
export type { TableType } from './common/TableType.ts';

// filter/
export type { ExistsFilter } from './filter/ExistsFilter.ts';
export type { FilterOperator } from './filter/FilterOperator.ts';
export type { JoinDetails } from './filter/JoinDetails.ts';
export type { JoinFilter } from './filter/JoinFilter.ts';
export type { Joins } from './filter/Joins.ts';
export type { Operators } from './filter/Operators.ts';
export type { QueryFilter } from './filter/QueryFilter.ts';

// expressions/
export type { DateExpressions } from './expressions/DateExpressions.ts';
export type { Expressions } from './expressions/Expressions.ts';
export type { GetExpressionByType } from './expressions/GetExpressionByType.ts';
export type { NumericExpressions } from './expressions/NumericExpressions.ts';
export type { StringExpressions } from './expressions/StringExpressions.ts';
export type { TimeUnit } from './expressions/TimeUnit.ts';

// aggregates/
export type { AggregateFunction } from './aggregates/AggregateFunction.ts';
export type { Aggregates } from './aggregates/Aggregates.ts';

// query/
export type { ColumnDefinition } from './query/ColumnDefinition.ts';
export type { Query } from './query/Query.ts';
export type { DDLQueries } from './query/DDLQueries.ts';
export type { DMLQueries } from './query/DMLQueries.ts';
export type { QueryTypes } from './query/QueryTypes.ts';
