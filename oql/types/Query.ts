import type { Joins, QueryFilter } from './Filter.ts';
import type { ColumnIdentifier, TableType } from './Common.ts';
import type { FlattenEntity } from '@tundralibs/utils';
import { Expression, GetExpressionByType } from './Expressions.ts';
import { Aggregates } from './Aggregates.ts';

/**
 * Helper type that allows each property to be either its original type
 * or an expression that returns that type.
 *
 * @template T - Table schema type
 *
 * @example
 * ```typescript
 * type User = { id: number; name: string; createdAt: Date };
 * type UserWithExpressions = DataWithExpressions<User>;
 * // Each property can be:
 * // - id: number | Expression<User, ...> that returns number
 * // - name: string | Expression<User, ...> that returns string
 * // - createdAt: Date | Expression<User, ...> that returns Date
 * ```
 */
type DataWithExpressions<T extends TableType> = {
  [K in keyof T]:
    | T[K]
    | Extract<
      Expression<T, FlattenEntity<T, '', '@'>>,
      { type: GetExpressionByType<T[K]> }
    >;
};

/**
 * Helper type for UPDATE data that allows partial updates with type-safe expressions.
 *
 * @template T - Table schema type
 */
type PartialDataWithExpressions<T extends TableType> = {
  [K in keyof T]?:
    | T[K]
    | Extract<
      Expression<T, FlattenEntity<T, '', '@'>>,
      { type: GetExpressionByType<T[K]> }
    >;
};

/**
 * Data Manipulation Language (DML) query types.
 *
 * DML queries operate on data within existing database structures:
 * - `SELECT`: Retrieve data from tables
 * - `INSERT`: Add new rows to tables
 * - `UPDATE`: Modify existing rows
 * - `UPSERT`: Insert or update based on conflict keys
 * - `DELETE`: Remove rows from tables
 * - `COUNT`: Get row count (optimized count query)
 *
 * @internal
 */
type DMLQueries =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'UPSERT'
  | 'DELETE'
  | 'COUNT';

/**
 * Data Definition Language (DDL) query types.
 *
 * DDL queries define and modify database structure:
 * - `CREATE_SCHEMA`: Create a new schema/namespace
 * - `DROP_SCHEMA`: Remove an existing schema
 * - `CREATE_TABLE`: Define a new table structure
 * - `DROP_TABLE`: Remove an existing table
 * - `ALTER_TABLE`: Modify table structure
 * - `CREATE_VIEW`: Create a virtual table from a query
 * - `DROP_VIEW`: Remove an existing view
 * - `ALTER_VIEW`: Modify view definition
 *
 * @internal
 */
type DDLQueries =
  | 'CREATE_SCHEMA'
  | 'DROP_SCHEMA'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'CREATE_VIEW'
  | 'DROP_VIEW'
  | 'ALTER_VIEW';

/**
 * All supported query types (DML + DDL).
 */
export type QueryTypes = DMLQueries | DDLQueries;

/**
 * Type-safe query definition for database operations.
 *
 * Provides a unified interface for constructing database queries across DML and DDL operations.
 * The query structure is database-agnostic and designed to be translated into specific SQL dialects
 * or NoSQL query formats.
 *
 * @template QT - Query type (SELECT, INSERT, UPDATE, etc.)
 * @template PT - Primary table schema (record of column names to types)
 * @template LT - Linked tables schema (record of table names to their schemas)
 *
 * ## Key Features:
 *
 * ### Type Safety:
 * - Column references use `ColumnIdentifier` pattern (`@column` or `@table.@column`)
 * - Filter operations are type-checked against table schemas
 * - Join conditions enforce type matching between linked columns
 *
 * ### DML Operations:
 *
 * **SELECT**: Retrieve data with optional joins, filtering, ordering, and aggregation
 * ```typescript
 * const query: Query<'SELECT', User, { Profile: ProfileSchema }> = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['@id', '@name', '@email'],
 *   joins: { Profile: { table: 'profiles', type: 'LEFT', on: { '@Profile.@userId': '@id' } } },
 *   where: { '@status': 'active', '@createdAt': { $gte: new Date() } },
 *   orderBy: { '@createdAt': 'DESC' },
 *   limit: 10
 * };
 * ```
 *
 * **INSERT**: Add new rows
 * ```typescript
 * const query: Query<'INSERT', User> = {
 *   type: 'INSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],
 *   data: { id: 1, name: 'John', email: 'john@example.com' }
 * };
 * ```
 *
 * **UPDATE**: Modify existing rows
 * ```typescript
 * const query: Query<'UPDATE', User> = {
 *   type: 'UPDATE',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],
 *   data: { name: 'Jane' },
 *   where: { '@id': 1 }
 * };
 * ```
 *
 * **UPSERT**: Insert or update on conflict
 * ```typescript
 * const query: Query<'UPSERT', User> = {
 *   type: 'UPSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],
 *   data: { id: 1, name: 'John', email: 'john@example.com' },
 *   conflictKeys: ['id']
 * };
 * ```
 *
 * **DELETE**: Remove rows
 * ```typescript
 * const query: Query<'DELETE', User> = {
 *   type: 'DELETE',
 *   table: 'users',
 *   columns: ['id', 'name', 'status'],
 *   where: { '@status': 'inactive' }
 * };
 * ```
 *
 * **COUNT**: Get row count (optimized)
 * ```typescript
 * const query: Query<'COUNT', User> = {
 *   type: 'COUNT',
 *   table: 'users',
 *   columns: ['id', 'status'],
 *   where: { '@status': 'active' }
 * };
 * ```
 *
 * ### DDL Operations:
 *
 * **CREATE_TABLE**: Define new table
 * ```typescript
 * const query: Query<'CREATE_TABLE', User> = {
 *   type: 'CREATE_TABLE',
 *   table: 'users',
 *   columns: {
 *     id: { type: 'integer', nullable: false },
 *     name: { type: 'varchar(255)', nullable: false },
 *     email: { type: 'varchar(255)', nullable: true }
 *   },
 *   primaryKey: ['id'],
 *   ifNotExists: true
 * };
 * ```
 *
 * **CREATE_VIEW**: Define virtual table
 * ```typescript
 * const query: Query<'CREATE_VIEW', ActiveUser> = {
 *   type: 'CREATE_VIEW',
 *   view: 'active_users',
 *   query: { type: 'SELECT', table: 'users', where: { '@status': 'active' } }
 * };
 * ```
 *
 * ### Filtering and Aggregation:
 *
 * - **WHERE**: Pre-aggregation filtering using `QueryFilter<PT & FlattenEntity<LT>>`
 * - **HAVING**: Post-aggregation filtering (after implicit GROUP BY)
 * - **Implicit GROUP BY**: Any column not in an aggregate function is automatically grouped
 *
 * ### Column References:
 *
 * All column references use `ColumnIdentifier` pattern:
 * - Simple: `@columnName`
 * - Qualified: `@tableName.@columnName`
 * - Nested: `@table.@column.@jsonKey.@subKey`
 *
 * This ensures consistency across projections, filters, joins, and ordering.
 *
 * @example
 * ```typescript
 * // Complex query with joins, filtering, and ordering
 * const complexQuery: Query<
 *   'SELECT',
 *   { id: number; name: string; createdAt: Date },
 *   { Profile: { userId: number; bio: string } }
 * > = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['@id', '@name', '@Profile.@bio'],
 *   joins: {
 *     Profile: {
 *       table: 'profiles',
 *       type: 'LEFT',
 *       on: { '@Profile.@userId': '@id' }
 *     }
 *   },
 *   where: {
 *     '@createdAt': { $gte: new Date('2024-01-01') },
 *     '@Profile.@bio': { $null: false }
 *   },
 *   orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
 *   limit: 100
 * };
 * ```
 */
export type Query<
  QT extends QueryTypes = QueryTypes,
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
> =
  & {
    type: QT;
  }
  & (
    QT extends DMLQueries ?
        & {
          /** Name of the table to operate on */
          table: string;
          /** Optional schema/namespace for the table */
          schema?: string;
          /**
           * Column identifiers for the operation.
           *
           * - **SELECT**: Columns to project in the result. If omitted in practice, all columns are selected (SELECT *)
           * - **INSERT/UPSERT**: Columns that will be inserted (must match data keys)
           * - **UPDATE**: Columns that can be updated (constrains data keys)
           * - **DELETE**: Columns available for filtering in WHERE clause
           * - **COUNT**: Columns available for filtering and grouping
           *
           * Uses ColumnIdentifier pattern: `@column` or `@table.@column`.
           */
          columns: Array<keyof PT>;
        }
        & (
          QT extends 'INSERT' ? {
              /**
               * Row(s) to insert - single object or array of objects.
               * Values can be direct values or expressions that return the matching type.
               */
              data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
            }
            : QT extends 'UPSERT' ? {
                /**
                 * Row(s) to insert or update - single object or array of objects.
                 * Values can be direct values or expressions that return the matching type.
                 */
                data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
                /**
                 * Column(s) to check for conflicts.
                 * If a row with these key values exists, UPDATE is performed instead of INSERT.
                 */
                conflictKeys: Array<keyof PT>;
              }
            : QT extends 'UPDATE' ? {
                /**
                 * Partial row data with columns to update.
                 * Values can be direct values or expressions that return the matching type.
                 */
                data: PartialDataWithExpressions<PT>;
                /**
                 * Optional filter to select which rows to update.
                 * If omitted, all rows are updated (use with caution!).
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'DELETE' ? {
                /**
                 * Optional filter to select which rows to delete.
                 * If omitted, all rows are deleted (use with caution!).
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'SELECT' ? {
                projection?: Record<
                  string,
                  | keyof FlattenEntity<PT, '', '@'>
                  | Aggregates<PT & LT>
                  | Expression<PT & LT>
                >;
                /**
                 * Optional join definitions for linking related tables.
                 * Each key is a table alias referencing a table in LT.
                 */
                joins?: Joins<PT, LT>;
                /**
                 * Optional filter condition for rows (pre-aggregation).
                 * Supports filtering on both primary table and joined table columns.
                 * Uses ColumnIdentifier pattern with flattened linked tables.
                 */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                /** Maximum number of rows to return */
                limit?: number;
                /** Number of rows to skip (for pagination) */
                offset?: number;
                /**
                 * Optional sort order using column identifiers.
                 * Keys are ColumnIdentifier patterns, values are 'ASC' or 'DESC'.
                 *
                 * @example
                 * { '@createdAt': 'DESC', '@name': 'ASC', '@Profile.@bio': 'ASC' }
                 */
                orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
                /**
                 * Optional post-aggregation filter (after implicit GROUP BY).
                 * Used to filter results after grouping on non-aggregate columns.
                 * Any column not in an aggregate function is automatically grouped.
                 */
                having?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
              }
            : QT extends 'COUNT' ? {
                /**
                 * Optional join definitions for linking related tables.
                 * Allows counting rows with join conditions.
                 */
                joins?: Joins<PT, LT>;
                /**
                 * Optional filter condition for rows (pre-aggregation).
                 * Determines which rows to include in the count.
                 */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                /**
                 * Optional post-aggregation filter (after implicit GROUP BY).
                 * Used when counting grouped results.
                 */
                having?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
              }
            : never
        )
      : QT extends DDLQueries ? QT extends 'CREATE_SCHEMA' ? {
            /** Name of the schema/namespace to create */
            schema: string;
          }
        : QT extends 'DROP_SCHEMA' ? {
            /** Name of the schema/namespace to drop */
            schema: string;
            /**
             * If true, also drop all objects within the schema.
             * If false, schema must be empty to drop.
             */
            cascade?: boolean;
          }
        : QT extends 'CREATE_TABLE' ? {
            /** Name of the table to create */
            table: string;
            /** Optional schema/namespace for the table */
            schema?: string;
            /**
             * Column definitions mapping column names to their properties.
             * Each column specifies its SQL type and nullability.
             */
            columns: Record<keyof PT, { type: string; nullable?: boolean }>;
            /**
             * Optional array of column names forming the primary key.
             * Can be a single column or composite key.
             */
            primaryKey?: Array<keyof PT>;
            /**
             * Optional unique constraints.
             * Maps constraint names to arrays of column names.
             */
            uniqueKeys?: Record<string, Array<keyof PT>>;
            /** If true, don't error if table already exists */
            ifNotExists?: boolean;
          }
        : QT extends 'DROP_TABLE' ? {
            /** Name of the table to drop */
            table: string;
            /** Optional schema/namespace for the table */
            schema?: string;
            /** If true, don't error if table doesn't exist */
            ifExists?: boolean;
            /**
             * If true, also drop dependent objects (views, foreign keys, etc.).
             * If false, operation fails if dependencies exist.
             */
            cascade?: boolean;
          }
        : QT extends 'ALTER_TABLE' ? {
            /** Name of the table to alter */
            table: string;
            /** Optional schema/namespace for the table */
            schema?: string;
            /**
             * Optional columns to add to the table.
             * Maps new column names to their type definitions.
             */
            addColumns?: Record<keyof PT, { type: string; nullable?: boolean }>;
            /** Optional array of column names to remove from the table */
            dropColumns?: Array<keyof PT>;
            /** Optional new name for the table (rename operation) */
            renameTo?: string;
          }
        : QT extends 'CREATE_VIEW' ? {
            /** Name of the view to create */
            view: string;
            /** Optional schema/namespace for the view */
            schema?: string;
            /**
             * SELECT query defining the view's data.
             * The view will always return the result of this query.
             */
            query: Query<'SELECT', PT, LT>;
            /**
             * If true, create a materialized view (cached results).
             * If false, create a regular view (dynamic query).
             */
            materialized?: boolean;
            /** If true, don't error if view already exists */
            ifNotExists?: boolean;
          }
        : QT extends 'DROP_VIEW' ? {
            /** Name of the view to drop */
            view: string;
            /** Optional schema/namespace for the view */
            schema?: string;
            /** If true, don't error if view doesn't exist */
            ifExists?: boolean;
            /**
             * If true, also drop dependent objects.
             * If false, operation fails if dependencies exist.
             */
            cascade?: boolean;
          }
        : QT extends 'ALTER_VIEW' ? {
            /** Name of the view to alter */
            view: string;
            /** Optional schema/namespace for the view */
            schema?: string;
            /** Optional new name for the view (rename operation) */
            renameTo?: string;
            /**
             * Optional new SELECT query to replace the view's definition.
             * Changes what data the view returns.
             */
            query?: Query<'SELECT', PT, LT>;
          }
        : never
      : never
  );
