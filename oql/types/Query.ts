import type { Joins, QueryFilter } from './Filter.ts';
import type { ColumnIdentifier, TableType } from './Common.ts';
import type { FlattenEntity } from '@tundralibs/utils';
import { Expressions, GetExpressionByType } from './Expressions.ts';
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
      Expressions<T, FlattenEntity<T, '', '@'>>,
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
      Expressions<T, FlattenEntity<T, '', '@'>>,
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
 * ### Column References - The @ Prefix Pattern:
 *
 * **IMPORTANT**: The `@` prefix is used ONLY where ambiguity exists between
 * column references and literal values. This keeps the API clean and intuitive.
 *
 * **When to use @ prefix**:
 * - ✅ In filters (WHERE/HAVING): `where: { '@status': 'active' }`
 * - ✅ In joins: `on: { '@Profile.@userId': '@id' }`
 * - ✅ In expressions: `{ type: 'ADD', args: ['@price', '@tax'] }`
 * - ✅ In aggregates: `{ type: 'SUM', column: '@amount' }`
 * - ✅ In projections: `projection: { userId: '@id' }`
 * - ✅ In orderBy: `orderBy: { '@createdAt': 'DESC' }`
 *
 * **When NOT to use @ prefix**:
 * - ❌ In `columns` property: `columns: ['id', 'name']` (schema definition)
 * - ❌ In `data` keys: `data: { name: 'John' }` (plain object keys)
 * - ❌ In `conflictKeys`: `conflictKeys: ['id']` (plain keys)
 * - ❌ In `primaryKey`: `primaryKey: ['id']` (plain keys)
 *
 * **ColumnIdentifier Patterns**:
 * - Simple: `@columnName` - References a column in the primary table
 * - Qualified: `@tableName.@columnName` - References a column in a joined table
 * - Nested (JSON): `@table.@column.@jsonKey.@subKey` - References nested JSON properties
 *
 * This pattern ensures type safety and clarity:
 * - Schema definitions use plain keys (what columns exist)
 * - Value references use @ prefix (distinguishing from literal strings)
 *
 * @example
 * ```typescript
 * const query: Query<'SELECT', User> = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],  // ✅ Plain keys (schema)
 *   projection: {                       // ✅ @ prefix (references)
 *     userId: '@id',
 *     userName: '@name'
 *   },
 *   where: { '@status': 'active' },    // ✅ @ prefix (references)
 *   orderBy: { '@createdAt': 'DESC' }  // ✅ @ prefix (references)
 * };
 *
 * const insertQuery: Query<'INSERT', User> = {
 *   type: 'INSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],  // ✅ Plain keys (schema)
 *   data: {                             // ✅ Plain keys (data)
 *     id: 1,
 *     name: 'John',
 *     email: 'john@example.com'
 *   }
 * };
 * ```
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
           * Available columns schema definition (plain keys, no @ prefix).
           *
           * **Purpose**: Defines which columns exist in the source table for validation.
           * This schema is used across ALL query types to validate column references
           * in filters, joins, expressions, aggregates, and data operations.
           *
           * **Consistent Role Across All Query Types**:
           * - Validates `@column` references in WHERE/HAVING clauses
           * - Validates `@column` references in JOIN conditions
           * - Validates `@column` references inside Expressions/Aggregates
           * - Validates `data` keys (INSERT/UPDATE/UPSERT)
           * - Validates projection references (SELECT)
           *
           * **Query-Specific Notes**:
           * - **SELECT**: Source schema for validation; actual output defined by `projection`
           * - **INSERT/UPSERT**: Inserted columns must match these keys
           * - **UPDATE**: Updated columns must be subset of these keys
           * - **DELETE/COUNT**: Used purely for validation (no data modification)
           *
           * **Important**: Always uses plain keys `['id', 'name', 'email']`.
           * The `@` prefix is ONLY used in column references (filters, joins, expressions)
           * to differentiate column identifiers from literal string values.
           *
           * @example
           * ```typescript
           * // ✅ Correct - Plain keys for schema definition
           * columns: ['id', 'name', 'email', 'createdAt', 'updatedAt']
           *
           * // Then use @ prefix when referencing these columns:
           * where: { '@status': 'active' }           // ✅ Filter reference
           * projection: { userId: '@id' }            // ✅ Projection reference
           * data: { name: 'John' }                   // ✅ Data keys (no @)
           *
           * // ❌ Wrong - Don't use @ prefix in columns
           * columns: ['@id', '@name']  // Will cause type errors
           * ```
           */
          columns: Array<keyof PT>;
        }
        & (
          QT extends 'INSERT' ? {
              /**
               * Row(s) to insert - single object or array of objects.
               *
               * **Keys**: Plain column names (must match `columns` definition)
               * **Values**: Can be:
               * - Direct literal values: `name: 'John'`, `age: 30`
               * - Expressions: `createdAt: { type: 'NOW' }`
               * - Computed expressions: `total: { type: 'ADD', args: ['@price', '@tax'] }`
               *
               * **Important**: Keys are plain strings (no @ prefix).
               * The `@` prefix is used INSIDE expressions to reference other columns.
               *
               * @example
               * ```typescript
               * // Single row with literals
               * data: {
               *   id: 1,
               *   name: 'John',
               *   email: 'john@example.com'
               * }
               *
               * // With expressions
               * data: {
               *   id: 1,
               *   name: 'John',
               *   createdAt: { type: 'NOW' },
               *   fullName: { type: 'CONCAT', args: ['John', ' ', 'Doe'] }
               * }
               *
               * // Multiple rows
               * data: [
               *   { id: 1, name: 'John' },
               *   { id: 2, name: 'Jane' }
               * ]
               * ```
               */
              data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
            }
            : QT extends 'UPSERT' ? {
                /**
                 * Row(s) to insert or update - single object or array of objects.
                 *
                 * **Keys**: Plain column names (must match `columns` definition)
                 * **Values**: Can be:
                 * - Direct literal values: `name: 'John'`, `age: 30`
                 * - Expressions: `createdAt: { type: 'NOW' }`
                 * - Computed expressions: `total: { type: 'ADD', args: ['@price', '@tax'] }`
                 *
                 * **On INSERT**: All fields from `data` are inserted.
                 * **On UPDATE (conflict)**: By default, all fields except `conflictKeys` are updated.
                 * Override this behavior with `updateOnConflict` for partial updates.
                 *
                 * @example
                 * ```typescript
                 * // Full data for insert, all fields updated on conflict (except id)
                 * data: {
                 *   id: 1,
                 *   name: 'John',
                 *   email: 'john@example.com',
                 *   createdAt: { type: 'NOW' }
                 * }
                 *
                 * // Multiple rows
                 * data: [
                 *   { id: 1, name: 'John', email: 'john@example.com' },
                 *   { id: 2, name: 'Jane', email: 'jane@example.com' }
                 * ]
                 * ```
                 */
                data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
                /**
                 * Column(s) to check for conflicts.
                 *
                 * When a row with matching values for these columns already exists,
                 * an UPDATE is performed instead of INSERT.
                 *
                 * **Important**: Plain column names (no @ prefix).
                 *
                 * @example
                 * ```typescript
                 * // Single key conflict (most common)
                 * conflictKeys: ['id']
                 *
                 * // Composite key conflict
                 * conflictKeys: ['userId', 'productId']
                 *
                 * // Unique constraint conflict
                 * conflictKeys: ['email']
                 * ```
                 */
                conflictKeys: Array<keyof PT>;
                /**
                 * Optional: Specify which fields to update when conflict occurs.
                 *
                 * **When omitted**: All fields from `data` (except `conflictKeys`) are updated.
                 * **When provided**: Only specified fields are updated on conflict.
                 *
                 * **Use Cases**:
                 * - Preserve original timestamps: Don't update `createdAt`
                 * - Increment counters: Update `viewCount` but not other fields
                 * - Set different values on update vs insert
                 *
                 * **Keys**: Plain column names (subset of `columns` definition)
                 * **Values**: Same as `data` - literals or expressions
                 *
                 * @example
                 * ```typescript
                 * // Insert full data, but only update name and updatedAt on conflict
                 * {
                 *   data: {
                 *     id: 1,
                 *     name: 'John',
                 *     email: 'john@example.com',
                 *     createdAt: { type: 'NOW' }
                 *   },
                 *   conflictKeys: ['id'],
                 *   updateOnConflict: {
                 *     name: 'John',
                 *     updatedAt: { type: 'NOW' }
                 *     // email and createdAt NOT updated - keeps original values
                 *   }
                 * }
                 *
                 * // Increment counter on conflict
                 * {
                 *   data: { userId: 1, productId: 5, viewCount: 1 },
                 *   conflictKeys: ['userId', 'productId'],
                 *   updateOnConflict: {
                 *     viewCount: { type: 'ADD', args: ['@viewCount', 1] }
                 *   }
                 * }
                 * ```
                 */
                updateOnConflict?: PartialDataWithExpressions<PT>;
              }
            : QT extends 'UPDATE' ? {
                /**
                 * Partial row data with columns to update.
                 *
                 * **Keys**: Plain column names (subset of `columns` definition)
                 * **Values**: Can be:
                 * - Direct literal values: `name: 'Jane'`, `age: 31`
                 * - Expressions: `updatedAt: { type: 'NOW' }`
                 * - Computed expressions: `total: { type: 'ADD', args: ['@price', '@tax'] }`
                 *
                 * **Important**: Only specify columns you want to update (partial update).
                 * Keys are plain strings (no @ prefix). The `@` prefix is used INSIDE
                 * expressions to reference columns.
                 *
                 * @example
                 * ```typescript
                 * // Update with literals
                 * data: {
                 *   name: 'Jane',
                 *   age: 31
                 * }
                 *
                 * // Update with expressions
                 * data: {
                 *   name: 'Jane',
                 *   updatedAt: { type: 'NOW' },
                 *   viewCount: { type: 'ADD', args: ['@viewCount', 1] }  // Increment
                 * }
                 * ```
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
                /**
                 * Output projection - REQUIRED for SELECT queries.
                 *
                 * Defines what to actually select and how to compute/transform the output.
                 * Keys are output field names, values can be:
                 * - Simple column references: `'@columnName'` or `'@Table.@column'`
                 * - Aggregate functions: `{ type: 'COUNT', column: '@id' }`
                 * - Expressions: `{ type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }`
                 *
                 * **Why mandatory?**: Forces explicit selection, enables type-safe output,
                 * and allows computed fields/aggregates alongside regular columns.
                 *
                 * **Column References**: Use `@` prefix to reference columns (distinguishes
                 * from literal strings). Available columns come from the `columns` property.
                 *
                 * @example
                 * ```typescript
                 * // Simple column selection
                 * projection: {
                 *   userId: '@id',
                 *   userName: '@name'
                 * }
                 *
                 * // With computed fields and aggregates
                 * projection: {
                 *   id: '@id',
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
                 *   orderCount: { type: 'COUNT', column: '@Order.@id' },
                 *   total: { type: 'SUM', column: '@Order.@amount' }
                 * }
                 *
                 * // With joined table columns
                 * projection: {
                 *   userName: '@name',
                 *   profileBio: '@Profile.@bio',
                 *   profileEmail: '@Profile.@email'
                 * }
                 * ```
                 */
                projection: Record<
                  string,
                  | keyof FlattenEntity<PT, '', '@'>
                  | Aggregates<PT & LT>
                  | Expressions<PT & LT>
                >;
                /**
                 * Optional join definitions for linking related tables.
                 * Each key is a table alias referencing a table in LT.
                 */
                joins?: Joins<PT, LT>;
                /**
                 * Optional filter condition for rows (pre-aggregation).
                 *
                 * Filters are applied BEFORE any aggregation occurs.
                 * Column references use `@` prefix to differentiate from literal values.
                 * Supports filtering on both primary table and joined table columns.
                 *
                 * @example
                 * ```typescript
                 * // Simple filter
                 * where: { '@status': 'active', '@age': { $gte: 18 } }
                 *
                 * // With joined tables
                 * where: {
                 *   '@status': 'active',
                 *   '@Profile.@verified': true
                 * }
                 *
                 * // Complex filters with logical operators
                 * where: {
                 *   $or: [
                 *     { '@role': 'admin' },
                 *     { '@role': 'moderator' }
                 *   ]
                 * }
                 * ```
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
                 *
                 * @example
                 * ```typescript
                 * joins: {
                 *   Profile: {
                 *     table: 'profiles',
                 *     type: 'LEFT',
                 *     on: { '@Profile.@userId': '@id' }
                 *   }
                 * }
                 * ```
                 */
                joins?: Joins<PT, LT>;
                /**
                 * Optional filter condition for rows (pre-aggregation).
                 *
                 * Determines which rows to include in the count.
                 * Column references use `@` prefix (validated against `columns` schema).
                 *
                 * @example
                 * ```typescript
                 * // Count active users
                 * where: { '@status': 'active' }
                 *
                 * // Count with joined table filter
                 * where: {
                 *   '@status': 'active',
                 *   '@Profile.@verified': true
                 * }
                 * ```
                 */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                /**
                 * Optional post-aggregation filter (after implicit GROUP BY).
                 *
                 * Used when counting grouped results. Applied AFTER grouping.
                 * Column references use `@` prefix (validated against `columns` schema).
                 *
                 * @example
                 * ```typescript
                 * // Count users per department with more than 10 members
                 * having: {
                 *   '@count': { $gt: 10 }
                 * }
                 * ```
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
