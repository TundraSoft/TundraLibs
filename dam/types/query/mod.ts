export type {
  BaseExpression,
  DateExpressions,
  ExpressionFunction,
  Expressions,
  JSONExpressions,
  NumberExpressions,
  StringExpressions,
  TypedExpressions,
} from './expressions/mod.ts';

export type { Aggregates, BaseAggregates } from './Aggregates.ts';

export type {
  BaseDMLQueryBuilder,
  BaseQueryBuilder,
  CountQueryBuilder,
  DeleteQueryBuilder,
  InsertQueryBuilder,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from './Builder.ts';

export type { ColumnIdentifier } from './ColumnIdentifier.ts';

export type {
  BaseOperators,
  HavingFilter,
  MathOperators,
  Operators,
  QueryFilters,
  StringOperators,
} from './Filter.ts';

export type { QueryType } from './Type.ts';

export type Query = {
  identifier?: string; // Identifier for the query. If not provided, will be generated
  sql: string; // The query
  params?: Record<string, unknown>; // Parameters
  returns?: boolean; // If this query returns data. Used if there are child queries.
  after?: (result: QueryResult) => Query; // After this query, run these queries
};

export type QueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  identifier: string;
  time: number; // Total time taken (includes all child queryies)
  count: number; // Affected/Selected rows of this query. If limit is set then this will be <= that limit. 0 if not applicable
  data?: R[];
  // child?: QueryResult[];
};
