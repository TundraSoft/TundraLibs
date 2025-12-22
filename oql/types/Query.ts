import type { Joins, QueryFilter } from './Filter.ts';
import type { ColumnIdentifier, SQLDataType, TableType } from './Common.ts';
import type { FlattenEntity } from '@tundralibs/utils';
import { Expressions, GetExpressionByType } from './Expressions.ts';
import { Aggregates } from './Aggregates.ts';

/**
 * Base properties common to all column definitions.
 */
type BaseColumnDefinition = {
  /** If true, column can contain NULL values. Defaults to true. */
  nullable?: boolean;
  /** Optional description/comment for the column */
  comment?: string;
};

/**
 * Column definition for CREATE_TABLE and ALTER_TABLE operations.
 *
 * Uses discriminated union to ensure only valid properties are specified
 * for each SQL data type:
 * - String types (CHAR, VARCHAR, TEXT, CLOB): allow length
 * - Binary types (BINARY, VARBINARY, BLOB): allow length
 * - Decimal types (DECIMAL, NUMERIC): allow precision and scale
 * - Other types: only base properties (nullable, comment)
 *
 * @template T - The TypeScript type this column represents (string, number, Date, etc.)
 *
 * @example
 * ```typescript
 * // String column with length
 * const name: ColumnDefinition<string> = {
 *   type: 'VARCHAR',
 *   length: 255,
 *   nullable: false
 * };
 *
 * // Decimal column with precision and scale
 * const price: ColumnDefinition<number> = {
 *   type: 'DECIMAL',
 *   precision: 10,
 *   scale: 2
 * };
 *
 * // Date column - cannot have length, precision, or scale
 * const createdAt: ColumnDefinition<Date> = {
 *   type: 'TIMESTAMP',
 *   nullable: false,
 *   comment: 'Record creation timestamp'
 * };
 * ```
 */
export type ColumnDefinition<T extends TableType[string] = TableType[string]> =
  | ({
    /** String SQL data type */
    type: 'CHAR' | 'VARCHAR' | 'TEXT' | 'CLOB';
    /**
     * Maximum length in characters.
     * Required for CHAR and VARCHAR in most databases.
     */
    length?: number;
  } & BaseColumnDefinition)
  | ({
    /** Binary SQL data type */
    type: 'BINARY' | 'VARBINARY' | 'BLOB';
    /**
     * Maximum length in bytes.
     * Required for BINARY and VARBINARY in most databases.
     */
    length?: number;
  } & BaseColumnDefinition)
  | ({
    /** Decimal SQL data type */
    type: 'DECIMAL' | 'NUMERIC';
    /**
     * Total number of digits (both integer and fractional parts).
     * Required for DECIMAL/NUMERIC types.
     */
    precision?: number;
    /**
     * Number of digits after decimal point.
     * Must be less than or equal to precision.
     */
    scale?: number;
  } & BaseColumnDefinition)
  | ({
    /** Other SQL data types that don't require length or precision/scale */
    type: Exclude<
      SQLDataType,
      | 'CHAR'
      | 'VARCHAR'
      | 'TEXT'
      | 'CLOB'
      | 'BINARY'
      | 'VARBINARY'
      | 'BLOB'
      | 'DECIMAL'
      | 'NUMERIC'
    >;
  } & BaseColumnDefinition);

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
 * - `REFRESH_MATERIALIZED_VIEW`: Refresh a materialized view's cached data
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
  | 'ALTER_VIEW'
  | 'REFRESH_MATERIALIZED_VIEW';

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
                 * **Important**: Use column identifiers with @ prefix.
                 *
                 * @example
                 * ```typescript
                 * // Single key conflict (most common)
                 * conflictKeys: ['@id']
                 *
                 * // Composite key conflict
                 * conflictKeys: ['@userId', '@productId']
                 *
                 * // Unique constraint conflict
                 * conflictKeys: ['@email']
                 * ```
                 */
                conflictKeys: ColumnIdentifier[];
                /**
                 * Optional: Specify which fields from data to update when conflict occurs.
                 *
                 * **When omitted**: All fields from `data` (except `conflictKeys`) are updated.
                 * **When provided**: Only specified fields are updated on conflict. Values come from `data`.
                 *
                 * **Use Cases**:
                 * - Preserve original timestamps: Don't update `createdAt`
                 * - Selective updates: Update only specific columns on conflict
                 * - Keep original values: Exclude columns from update
                 *
                 * **Important**:
                 * - Use column identifiers with @ prefix
                 * - Values are taken from the `data` object
                 * - All specified columns must exist in `data`
                 *
                 * @example
                 * ```typescript
                 * // Insert full data, but only update name and updatedAt on conflict
                 * {
                 *   data: {
                 *     id: 1,
                 *     name: 'John',
                 *     email: 'john@example.com',
                 *     createdAt: { type: 'NOW' },
                 *     updatedAt: { type: 'NOW' }
                 *   },
                 *   conflictKeys: ['@id'],
                 *   updateOnConflict: ['@name', '@updatedAt']
                 *   // email and createdAt NOT updated - keeps original values
                 * }
                 *
                 * // Update only quantity on conflict
                 * {
                 *   data: { userId: 1, productId: 5, quantity: 10, lastViewed: { type: 'NOW' } },
                 *   conflictKeys: ['@userId', '@productId'],
                 *   updateOnConflict: ['@quantity', '@lastViewed']
                 * }
                 * ```
                 */
                updateOnConflict?: ColumnIdentifier[];
              }
            : QT extends 'UPDATE' ? {
                /**
                 * Optional expression definitions for computed columns.
                 *
                 * Pre-declare expressions to use in WHERE clause.
                 * Keys become available as `@keyName` in filters.
                 *
                 * **Expression Chaining**: Expressions CANNOT reference other expressions.
                 * Nested expressions must be defined inline.
                 *
                 * @example
                 * ```typescript
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
                 *   ageInMonths: { type: 'MULTIPLY', args: ['@age', 12] }
                 * },
                 * where: {
                 *   '@fullName': { $like: 'John%' },
                 *   '@ageInMonths': { $gte: 240 }
                 * }
                 * ```
                 */
                expressions?: Record<string, Expressions<PT>>;
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
                 *
                 * Can reference:
                 * - Base table columns: `@columnName`
                 * - Expressions: `@expressionName` (from `expressions` property)
                 *
                 * If omitted, all rows are updated (use with caution!).
                 *
                 * @example
                 * ```typescript
                 * // Filter by column
                 * where: { '@status': 'active', '@age': { $gte: 18 } }
                 *
                 * // Filter by expression
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }
                 * },
                 * where: {
                 *   '@fullName': { $like: 'John%' }
                 * }
                 * ```
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'DELETE' ? {
                /**
                 * Optional expression definitions for computed columns.
                 *
                 * Pre-declare expressions to use in WHERE clause.
                 * Keys become available as `@keyName` in filters.
                 *
                 * **Expression Chaining**: Expressions CANNOT reference other expressions.
                 * Nested expressions must be defined inline.
                 *
                 * @example
                 * ```typescript
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
                 *   accountAge: { type: 'SUBTRACT', args: [{ type: 'NOW' }, '@createdAt'] }
                 * },
                 * where: {
                 *   '@fullName': 'Deleted User',
                 *   '@accountAge': { $gte: 365 }  // Older than 1 year
                 * }
                 * ```
                 */
                expressions?: Record<string, Expressions<PT>>;
                /**
                 * Optional filter to select which rows to delete.
                 *
                 * Can reference:
                 * - Base table columns: `@columnName`
                 * - Expressions: `@expressionName` (from `expressions` property)
                 *
                 * If omitted, all rows are deleted (use with caution!).
                 *
                 * @example
                 * ```typescript
                 * // Filter by column
                 * where: { '@status': 'inactive', '@deletedAt': { $null: false } }
                 *
                 * // Filter by expression
                 * expressions: {
                 *   accountAge: { type: 'SUBTRACT', args: [{ type: 'NOW' }, '@createdAt'] }
                 * },
                 * where: {
                 *   '@accountAge': { $gte: 730 }  // Delete accounts older than 2 years
                 * }
                 * ```
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'SELECT' ? {
                /**
                 * Optional aggregate function definitions.
                 *
                 * Pre-declare aggregates to use in projection, having, and orderBy.
                 * Keys become available as `@keyName` in projection and filters.
                 *
                 * **Automatic GROUP BY**: When aggregates are defined, non-aggregated
                 * columns in projection are automatically grouped (SQL standard behavior).
                 *
                 * @example
                 * ```typescript
                 * aggregates: {
                 *   totalSales: { type: 'SUM', column: '@amount' },
                 *   orderCount: { type: 'COUNT', column: '@id' },
                 *   avgPrice: { type: 'AVG', column: '@price' }
                 * }
                 * ```
                 */
                aggregates?: Record<string, Aggregates<PT & LT>>;
                /**
                 * Optional expression definitions for computed columns.
                 *
                 * Pre-declare expressions to use in projection, where, and orderBy.
                 * Keys become available as `@keyName` in projection and filters.
                 *
                 * **Expression Chaining**: Expressions CANNOT reference other expressions.
                 * Nested expressions must be defined inline.
                 *
                 * @example
                 * ```typescript
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
                 *   upperEmail: { type: 'UPPER', args: ['@email'] },
                 *   // ❌ Cannot reference fullName expression
                 *   // upperFullName: { type: 'UPPER', args: ['@fullName'] }
                 *   // ✅ Must nest the expression
                 *   upperFullName: {
                 *     type: 'UPPER',
                 *     args: [{ type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }]
                 *   }
                 * }
                 * ```
                 */
                expressions?: Record<string, Expressions<PT & LT>>;
                /**
                 * Optional join definitions for linking related tables.
                 *
                 * Each key is a table alias. Joined table columns must be explicitly listed
                 * in the `columns` array to be available in projection, filters, and expressions.
                 *
                 * @example
                 * ```typescript
                 * joins: {
                 *   Profile: {
                 *     table: 'profiles',
                 *     columns: ['bio', 'email', 'verified'],  // Must list all used columns
                 *     type: 'LEFT',
                 *     on: { '@Profile.@userId': '@id' }
                 *   }
                 * }
                 * ```
                 */
                joins?: Joins<PT, LT>;
                /**
                 * Output projection - REQUIRED for SELECT queries.
                 *
                 * Selects which columns, expressions, aggregates, and joined columns to include
                 * in the result. All keys use `@` prefix for consistency.
                 *
                 * **Key Format**: `@columnName`, `@expressionName`, `@aggregateName`, or `@JoinAlias.@column`
                 *
                 * **Value Options**:
                 * - `true`: Include with same name (without @ prefix)
                 * - `'aliasName'`: Include with custom alias
                 *
                 * **Available Keys**:
                 * - Base table columns: `@columnName` (from `columns` property)
                 * - Expressions: `@expressionName` (from `expressions` property)
                 * - Aggregates: `@aggregateName` (from `aggregates` property)
                 * - Joined columns: `@JoinAlias.@columnName` (from join's `columns` array)
                 *
                 * **Automatic GROUP BY**: When `aggregates` is defined, all non-aggregate
                 * columns in projection are automatically grouped.
                 *
                 * @example
                 * ```typescript
                 * // Simple column selection
                 * projection: {
                 *   '@id': 'userId',           // Column with alias
                 *   '@name': true,             // Column with same name
                 *   '@email': true
                 * }
                 * // Generated SQL: SELECT id as userId, name, email FROM ...
                 *
                 * // With expressions
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }
                 * },
                 * projection: {
                 *   '@id': true,
                 *   '@fullName': 'name'        // Expression with alias
                 * }
                 *
                 * // With aggregates (automatic grouping)
                 * aggregates: {
                 *   totalSales: { type: 'SUM', column: '@amount' },
                 *   orderCount: { type: 'COUNT', column: '@id' }
                 * },
                 * projection: {
                 *   '@userId': true,           // Automatically grouped
                 *   '@department': true,       // Automatically grouped
                 *   '@totalSales': 'total',    // Aggregated
                 *   '@orderCount': true        // Aggregated
                 * }
                 * // Generated SQL: SELECT userId, department, SUM(amount) as total,
                 * //                COUNT(id) as orderCount FROM ... GROUP BY userId, department
                 *
                 * // With joined columns
                 * joins: {
                 *   Profile: {
                 *     table: 'profiles',
                 *     columns: ['bio', 'email'],
                 *     on: { '@Profile.@userId': '@id' }
                 *   }
                 * },
                 * projection: {
                 *   '@id': true,
                 *   '@name': true,
                 *   '@Profile.@email': 'userEmail',  // Joined column with alias
                 *   '@Profile.@bio': true             // Joined column same name
                 * }
                 * ```
                 */
                projection: Record<string, boolean | string>;
                /**
                 * Optional filter condition for rows (pre-aggregation).
                 *
                 * Filters are applied BEFORE any aggregation occurs.
                 * Column references use `@` prefix to differentiate from literal values.
                 *
                 * **Available References**:
                 * - Base table columns: `@columnName`
                 * - Joined table columns: `@JoinAlias.@columnName`
                 * - Expressions: `@expressionName` (from `expressions` property)
                 *
                 * **NOT Available**: Aggregates (use `having` for aggregate filtering)
                 *
                 * @example
                 * ```typescript
                 * // Simple column filter
                 * where: { '@status': 'active', '@age': { $gte: 18 } }
                 *
                 * // With joined tables
                 * where: {
                 *   '@status': 'active',
                 *   '@Profile.@verified': true
                 * }
                 *
                 * // With expressions
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }
                 * },
                 * where: {
                 *   '@fullName': { $ne: 'John Doe' }  // Filter by expression
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
                 * Optional sort order.
                 *
                 * Can reference:
                 * - Any key from `projection` (including columns, expressions, aggregates)
                 * - Any joined table column (from join's `columns` array)
                 *
                 * Keys use `@` prefix, values are 'ASC' or 'DESC'.
                 *
                 * @example
                 * ```typescript
                 * // Order by projection keys
                 * orderBy: {
                 *   '@totalSales': 'DESC',     // Aggregate from projection
                 *   '@fullName': 'ASC'         // Expression from projection
                 * }
                 *
                 * // Order by joined column (must be in join's columns array)
                 * orderBy: {
                 *   '@Profile.@createdAt': 'DESC'
                 * }
                 * ```
                 */
                orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
                /**
                 * Optional post-aggregation filter (equivalent to SQL's HAVING clause).
                 *
                 * Applied AFTER implicit grouping occurs. Use this to filter aggregated results.
                 * Only evaluated when `aggregates` is defined.
                 *
                 * **Available References**: Aggregate names (from `aggregates` property) using `@` prefix
                 *
                 * **When to use**:
                 * - Filter based on aggregate values (e.g., COUNT > 10, SUM < 1000)
                 * - Filter groups, not individual rows
                 *
                 * **Difference from `where`**:
                 * - `where`: Filters individual rows BEFORE aggregation (columns, expressions, joins)
                 * - `having`: Filters grouped results AFTER aggregation (aggregates only)
                 *
                 * @example
                 * ```typescript
                 * // Filter by aggregate value
                 * aggregates: {
                 *   employeeCount: { type: 'COUNT', column: '@id' }
                 * },
                 * having: {
                 *   '@employeeCount': { $gt: 5 }  // Only groups with >5 employees
                 * }
                 *
                 * // Multiple aggregate filters
                 * aggregates: {
                 *   totalSpent: { type: 'SUM', column: '@amount' },
                 *   orderCount: { type: 'COUNT', column: '@id' }
                 * },
                 * having: {
                 *   '@totalSpent': { $gte: 1000 },
                 *   '@orderCount': { $gt: 5 }
                 * }
                 * ```
                 */
                having?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
              }
            : QT extends 'COUNT' ? {
                /**
                 * Optional expression definitions for computed columns.
                 *
                 * Pre-declare expressions to use in WHERE clause.
                 * Keys become available as `@keyName` in filters.
                 *
                 * **Expression Chaining**: Expressions CANNOT reference other expressions.
                 * Nested expressions must be defined inline.
                 *
                 * @example
                 * ```typescript
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
                 *   age: { type: 'SUBTRACT', args: [{ type: 'YEAR', args: [{ type: 'NOW' }] }, { type: 'YEAR', args: ['@birthDate'] }] }
                 * }
                 * ```
                 */
                expressions?: Record<string, Expressions<PT & LT>>;
                /**
                 * Optional join definitions for linking related tables.
                 * Allows counting rows with join conditions.
                 *
                 * @example
                 * ```typescript
                 * joins: {
                 *   Profile: {
                 *     table: 'profiles',
                 *     columns: ['userId', 'verified'],
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
                 *
                 * **Available References**:
                 * - Base table columns: `@columnName`
                 * - Joined table columns: `@JoinAlias.@columnName`
                 * - Expressions: `@expressionName` (from `expressions` property)
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
                 *
                 * // Count with expression filter
                 * expressions: {
                 *   fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }
                 * },
                 * where: {
                 *   '@fullName': { $like: 'John%' }
                 * }
                 * ```
                 */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                /**
                 * Optional post-aggregation filter (after implicit GROUP BY).
                 *
                 * Used when counting grouped results. Applied AFTER grouping.
                 *
                 * **Note**: This is rarely used in COUNT queries. Most filtering
                 * should be done in `where` clause before counting.
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
            /**
             * If true, replace the view if it already exists.
             * Cannot be used with ifNotExists.
             */
            orReplace?: boolean;
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
        : QT extends 'REFRESH_MATERIALIZED_VIEW' ? {
            /** Name of the materialized view to refresh */
            view: string;
            /** Optional schema/namespace for the view */
            schema?: string;
            /**
             * If true, refresh concurrently (allows reads during refresh).
             * Requires a unique index on the view.
             * If false, exclusive lock is taken during refresh.
             */
            concurrently?: boolean;
          }
        : never
      : never
  );
