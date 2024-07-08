import type { QueryType } from './Type.ts';
import type { QueryFilters } from './Filter.ts';
import type { ColumnIdentifier } from './ColumnIdentifier.ts';
import type { Expressions } from './expressions/mod.ts';
import type { Aggregates } from './Aggregates.ts';

export type BaseQueryBuilder = {
  type: QueryType;
  source: string;
  schema?: string; // Schema or database
};

export type BaseDMLQueryBuilder = BaseQueryBuilder & {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | 'COUNT';
  columns: string[];
  expressions?: Record<string, Expressions>;
};

export type InsertQueryBuilder = BaseDMLQueryBuilder & {
  type: 'INSERT';
  values: Record<string, unknown>[];
  project?: Record<ColumnIdentifier, boolean>;
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type UpdateQueryBuilder = BaseDMLQueryBuilder & {
  type: 'UPDATE';
  values: Record<string, unknown>;
  where?: QueryFilters;
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type DeleteQueryBuilder = BaseDMLQueryBuilder & {
  type: 'DELETE';
  where?: QueryFilters;
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type SelectQueryBuilder = BaseDMLQueryBuilder & {
  type: 'SELECT';
  project: Record<ColumnIdentifier, boolean>;
  where?: QueryFilters;
  limit?: number;
  offset?: number;
  order?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
  aggregates?: Aggregates;
  // having?: Record<string, unknown>; // Should be MathOperators only
  groupBy?: ColumnIdentifier[];
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type CountQueryBuilder = BaseDMLQueryBuilder & {
  type: 'COUNT';
  aggregates: {
    Count: {
      $aggr: 'COUNT';
      $args: ColumnIdentifier | '*';
    };
  };
  where?: QueryFilters;
} extends infer O ? { [P in keyof O]: O[P] } : never;
