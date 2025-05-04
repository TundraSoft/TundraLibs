import type { ExcludeNever, FlattenEntity } from '@tundralibs/utils';
import type { ColumnDefinition } from './column/mod.ts';
import type { QueryFilters } from './Filter.ts';
import type { ExpressionDefinition } from './Expressions.ts';
import { AggregateDefinition } from './Aggregate.ts';

/**
 * SQLDDLType enumerates all supported SQL Data Definition Language (DDL) operations.
 * These types represent the various schema and table manipulation commands.
 */
export type DDLTypes =
  | 'CREATE_SCHEMA'
  | 'DROP_SCHEMA'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'CREATE_VIEW'
  | 'ALTER_VIEW'
  | 'DROP_VIEW'
  | 'CREATE_INDEX'
  | 'DROP_INDEX';

/**
 * DDLQuery is a discriminated union type that describes the structure of each supported
 * DDL operation. The shape of the object depends on the DDL type provided.
 *
 * @template T - The DDL operation type (must be one of DDLTypes)
 *
 * @example
 * // Example: Creating a table
 * const ddl: DDLQuery<'CREATE_TABLE'> = {
 *   type: 'CREATE_TABLE',
 *   name: 'users',
 *   columns: [...],
 *   primaryKeys: ['id'],
 *   comment: 'User table'
 * };
 */
export type DDLQuery<T extends DDLTypes> =
  & {
    type: T;
    schema?: string;
  }
  & (
    T extends 'CREATE_SCHEMA' ? {
        schema: string;
      }
      : T extends 'DROP_SCHEMA' ? {
          schema: string;
        }
      : T extends 'CREATE_TABLE' ? {
          name: string;
          columns: Array<ColumnDefinition>;
          primaryKeys?: Array<string>;
          uniqueKeys?: Record<string, Array<string>>;
          foreignKeys?: Record<
            string,
            { schema?: string; table: string; relation: Record<string, string> }
          >;
          indexes?: Record<
            string,
            { columns: Array<string>; unique?: boolean }
          >;
          comment?: string;
        }
      : T extends 'DROP_TABLE' ? {
          name: string;
        }
      : T extends 'ALTER_TABLE' ? {
          name: string;
          dropColumns?: Array<string>;
          addColumns?: Array<ColumnDefinition>;
          renameColumns?: Record<string, string>;
          alterColumns?: Array<ColumnDefinition>;
          addForeignKeys?: Record<
            string,
            { schema?: string; table: string; relation: Record<string, string> }
          >;
          dropForeignKeys?: Array<string>;
          addUniqueKeys?: Record<string, Array<string>>;
          dropUniqueKeys?: Array<string>;
        }
      : T extends 'CREATE_VIEW' ? {
          name: string;
          query: DMLQuery<'SELECT'> | string;
          materialized?: boolean;
          comment?: string;
        }
      : T extends 'ALTER_VIEW' ? {
          name: string;
          query: DMLQuery<'SELECT'> | string;
          materialized?: boolean;
        }
      : T extends 'DROP_VIEW' ? {
          name: string;
        }
      : T extends 'CREATE_INDEX' ? {
          name: string;
          table: string;
          columns: Array<string>;
          unique?: boolean;
        }
      : T extends 'DROP_INDEX' ? {
          name: string;
        }
      : never
  ) extends infer O ? {
    [Property in keyof O]: O[Property];
  }
  : never;

export type DMLTypes =
  | 'INSERT'
  | 'UPSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'SELECT'
  | 'TRUNCATE';

// R is record type, E is expressions so excluded in insert, J is relationship so exclude them.
type ModifyRecord<
  R extends Record<string, unknown>,
  E extends Array<keyof FlattenEntity<R>> = [],
  J extends Array<keyof R> = [],
> = ExcludeNever<
  {
    [K in keyof R]: K extends E[number] ? never
      : K extends J[number] ? never
      : undefined extends R[K] ? R[K] | null // Allow null for optional properties
      : R[K];
  }
> extends infer O ? {
    [K in keyof O]: O[K];
  }
  : never;

type Joins<
  R extends Record<string, unknown>,
  E extends Array<keyof FlattenEntity<R>> = [],
  J extends Array<keyof R> = [],
> = {
  [S in keyof R as S extends J[number] ? S : never]: {
    schema?: string;
    table: string;
    columns: Array<Exclude<keyof R[S], E[number] | J[number]>>;
    on: {
      [K in keyof R[S]]?: keyof FlattenEntity<Omit<R, S | E[number]>>; //keyof Exclude<keyof R, S>,
    };
  };
};

/**
 * DMLQuery defines the structure for SQL Data Manipulation Language operations.
 *
 * @template T - The DML operation type (must be one of DMLTypes)
 * @template R - The record type representing the table schema
 * @template E - Array of expression field keys (used for computed columns or aggregates)
 * @template J - Array of join relation keys
 *
 * For SELECT operations, the following properties are available:
 * - project: Columns to select
 * - expressions: Define computed columns and aggregations
 * - filters: WHERE clause conditions
 * - having: HAVING clause conditions for filtering on aggregate results
 * - joins: Define table joins
 * - limit: Maximum number of rows to return
 * - offset: Number of rows to skip
 * - orderBy: Sorting instructions
 *
 * @example
 * ```typescript
 * // Example: SELECT with aggregation and HAVING clause
 * const query: DMLQuery<'SELECT', UserTable, ['count'], []> = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['department'],
 *   expressions: {
 *     count: { $aggr: 'COUNT', $args: ['1'] }
 *   },
 *   having: { count: { $gt: 5 } },
 *   orderBy: { count: 'DESC' }
 * };
 * ```
 */
export type DMLQuery<
  T extends DMLTypes,
  R extends Record<string, unknown> = Record<string, unknown>,
  E extends Array<keyof FlattenEntity<R>> = [],
  J extends Array<keyof R> = [],
> =
  & {
    type: T;
    schema?: string;
    table: string;
    columns: Array<Exclude<keyof R, E[number] | J[number]>>;
  }
  & (
    T extends 'TRUNCATE' ? {
        columns: never;
      }
      : T extends 'INSERT' ? {
          data: Array<ModifyRecord<R, E, J>>;
        }
      : T extends 'UPSERT' ? {
          data: Array<ModifyRecord<R, E, J>>;
          conflictColumns: Array<keyof ModifyRecord<R, E, J>>; // Columns to check for conflicts
        }
      : T extends 'UPDATE' ? {
          data: Partial<ModifyRecord<R, E, J>>; // Data to update
          filters?: QueryFilters<Omit<R, J[number]>>; // Filters to apply
        }
      : T extends 'DELETE' ? {
          filters?: QueryFilters<Omit<R, J[number]>>; // Filters to apply
        }
      : T extends 'SELECT' ? {
          project: Array<keyof R>; // Columns to select
          expressions?: {
            [K in E[number]]?:
              | ExpressionDefinition<FlattenEntity<R>[K]>
              | AggregateDefinition<
                Extract<
                  FlattenEntity<R>[K],
                  | number
                  | bigint
                  | Date
                  | Record<string, unknown>
                  | Array<Record<string, unknown>>
                >
              >;
          }; // Expressions to select
          filters?: QueryFilters<R>; // Filters to apply (WHERE clause)
          having?: QueryFilters<Pick<FlattenEntity<R>, E[number]>>; // Filters for aggregate results (HAVING clause)
          joins?: Joins<R, E, J>; // Joins to apply
          limit?: number; // Limit the number of results
          offset?: number; // Offset for pagination
          orderBy?: Record<keyof FlattenEntity<R>, 'ASC' | 'DESC'>; // Order by clause
        }
      : never
  ) extends infer O ? {
    [Property in keyof O]: O[Property];
  }
  : never;
