import type { FlattenEntity } from '@tundralibs/utils';
import type { Aggregates } from '../aggregates/Aggregates.ts';
import type { ColumnIdentifier } from '../common/ColumnIdentifier.ts';
import type { ForeignKeyConstraint } from '../common/ForeignKeyConstraint.ts';
import type { IndexMethod } from '../common/IndexMethod.ts';
import type { TableType } from '../common/TableType.ts';
import type { Expressions } from '../expressions/Expressions.ts';
import type { GetExpressionByType } from '../expressions/GetExpressionByType.ts';
import type { Joins } from '../filter/Joins.ts';
import type { QueryFilter } from '../filter/QueryFilter.ts';
import type { ColumnDefinition } from './ColumnDefinition.ts';
import type { DDLQueries, DMLQueries, QueryTypes } from './QueryTypes.ts';

/**
 * Each property can be its original type OR an expression returning
 * that type. Used by INSERT/UPSERT data shapes.
 */
type DataWithExpressions<T extends TableType> = {
  [K in keyof T]:
    | T[K]
    | Extract<
      Expressions<T, FlattenEntity<T, '', '@'>>,
      { $$_expression: GetExpressionByType<T[K]> }
    >;
};

/** Same as {@link DataWithExpressions} but all keys are optional. */
type PartialDataWithExpressions<T extends TableType> = {
  [K in keyof T]?:
    | T[K]
    | Extract<
      Expressions<T, FlattenEntity<T, '', '@'>>,
      { $$_expression: GetExpressionByType<T[K]> }
    >;
};

/**
 * Type-safe query definition for database operations.
 *
 * Database-agnostic — translators map this shape into the
 * dialect-specific SQL or NoSQL form.
 *
 * @template QT - Query type (`SELECT`, `INSERT`, …; see
 *   {@link QueryTypes}).
 * @template PT - Primary table schema (record of column names to
 *   types).
 * @template LT - Linked tables schema (record of table names to
 *   their schemas).
 *
 * ## Column references — the `@` prefix pattern
 *
 * The `@` prefix is used ONLY where ambiguity exists between column
 * references and literal values:
 *
 * **Use `@`** in filters, joins, expressions, aggregates,
 * projections, `orderBy`.
 *
 * **Don't use `@`** in `columns`, `data` keys, `conflictKeys`,
 * `primaryKey` — these are plain identifiers, not references.
 *
 * **Patterns**:
 * - `@columnName` — column in the primary table.
 * - `@tableName.@columnName` — joined-table column.
 * - `@table.@column.@jsonKey.@subKey` — nested JSON property.
 *
 * @example Complex SELECT with joins
 * ```ts
 * const query: Query<
 *   'SELECT',
 *   { id: number; name: string; createdAt: Date },
 *   { Profile: { userId: number; bio: string } }
 * > = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name'],
 *   joins: {
 *     Profile: {
 *       table: 'profiles', type: 'LEFT',
 *       columns: ['userId', 'bio'],
 *       on: { '@Profile.@userId': '@id' },
 *     },
 *   },
 *   projection: { '@id': true, '@name': true, '@Profile.@bio': 'bio' },
 *   where: {
 *     '@createdAt': { $gte: new Date('2024-01-01') },
 *     '@Profile.@bio': { $null: false },
 *   },
 *   orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
 *   limit: 100,
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
          /** Name of the table to operate on. */
          table: string;
          /** Optional schema/namespace for the table. */
          schema?: string;
          /**
           * Available columns (plain keys, no `@` prefix). Used
           * across all DML variants for validation of `@column`
           * references in filters, joins, expressions, aggregates,
           * and data operations.
           */
          columns: Array<keyof PT>;
        }
        & (
          QT extends 'INSERT' ? {
              /**
               * Row(s) to insert — single object or array.
               * Plain column-name keys; values may be literals or
               * expressions.
               */
              data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
              /**
               * Optional `RETURNING` projection. When omitted,
               * every column in `columns` is returned. Plain
               * column names — no `@` prefix.
               */
              projection?: ReadonlyArray<keyof PT & string>;
            }
            : QT extends 'INSERT_FROM_QUERY' ? {
                /**
                 * Source `SELECT` whose result rows feed the
                 * `INSERT`. Emits
                 * `INSERT INTO target (col1, col2, …) SELECT … FROM source`.
                 */
                query: Query<
                  'SELECT',
                  TableType,
                  Record<string, TableType>
                >;
              }
            : QT extends 'UPSERT' ? {
                /** Row(s) to insert-or-update. */
                data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
                /**
                 * Column(s) checked for conflict. Match → UPDATE;
                 * no match → INSERT. Use `@`-prefixed identifiers.
                 */
                conflictKeys: ColumnIdentifier[];
                /**
                 * Optional — which fields to update on conflict.
                 * When omitted, every field in `data` (except
                 * `conflictKeys`) is updated. Use `@`-prefixed
                 * identifiers.
                 */
                updateOnConflict?: ColumnIdentifier[];
                /**
                 * Optional `RETURNING` projection — same semantics
                 * as on `INSERT`.
                 */
                projection?: ReadonlyArray<keyof PT & string>;
              }
            : QT extends 'UPDATE' ? {
                /**
                 * Optional expression definitions. Keys become
                 * available as `@keyName` in filters. Expressions
                 * cannot reference other expressions.
                 */
                expressions?: Record<string, Expressions<PT>>;
                /** Partial row data — only the columns to update. */
                data: PartialDataWithExpressions<PT>;
                /**
                 * Optional row filter. Omit at your peril — every
                 * row gets the update.
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'DELETE' ? {
                /**
                 * Optional expression definitions. Same semantics
                 * as in `UPDATE`.
                 */
                expressions?: Record<string, Expressions<PT>>;
                /**
                 * Optional row filter. Omit at your peril — every
                 * row gets deleted.
                 */
                where?: QueryFilter<PT>;
              }
            : QT extends 'SELECT' ? {
                /**
                 * When true, emits `SELECT DISTINCT` — deduplicates
                 * the projected result rows. Typical use: a JOIN on
                 * a to-many relation used only for filtering fans
                 * the base rows out; DISTINCT collapses them again.
                 *
                 * **Interaction with aggregates / GROUP BY**:
                 * `distinct: true` is REJECTED (validator throws)
                 * when `aggregates` are declared or when a
                 * projection key auto-expands a join alias into a
                 * `JSON_ROW` aggregate — both trigger an automatic
                 * `GROUP BY` of every non-aggregated projection
                 * key, which already deduplicates; a redundant
                 * DISTINCT would only mask intent.
                 */
                distinct?: boolean;
                /**
                 * Optional aggregate definitions. Keys become
                 * available as `@keyName` in projection, having,
                 * and orderBy. Defining aggregates triggers
                 * automatic GROUP BY of non-aggregated projection
                 * keys.
                 */
                aggregates?: Record<string, Aggregates<PT & LT>>;
                /**
                 * Optional expression definitions. Keys become
                 * available as `@keyName` in projection, where,
                 * and orderBy. Expressions cannot reference other
                 * expressions.
                 */
                expressions?: Record<string, Expressions<PT & LT>>;
                /**
                 * Optional join definitions. Each entry's
                 * `columns` array must list every joined column
                 * referenced elsewhere in the query.
                 */
                joins?: Joins<PT, LT>;
                /**
                 * **REQUIRED** projection. Keys use `@`-prefixed
                 * identifiers for columns / expressions /
                 * aggregates / joined columns. Values: `true`
                 * (keep original name) or a string alias.
                 */
                projection: Record<string, boolean | string>;
                /**
                 * Pre-aggregation row filter. Can reference base
                 * columns, joined columns, and expressions — but
                 * NOT aggregates (use `having`).
                 */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                /** Maximum number of rows to return. */
                limit?: number;
                /** Number of rows to skip (pagination). */
                offset?: number;
                /**
                 * Optional sort order. Keys are `@`-prefixed
                 * projection keys or joined columns; values
                 * `'ASC'` / `'DESC'`.
                 */
                orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
                /**
                 * Optional post-aggregation filter — SQL `HAVING`.
                 * Use for aggregate filters (`COUNT > 10`,
                 * `SUM < 1000`).
                 */
                having?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
              }
            : QT extends 'COUNT' ? {
                /**
                 * Optional dedup: count DISTINCT values of exactly
                 * ONE column — `COUNT(DISTINCT col)`. A
                 * single-element tuple of a plain column name (no
                 * `@` prefix) that must appear in `columns`.
                 * Restricted to one column because multi-column
                 * DISTINCT counts are not portable across SQL
                 * dialects. Typical use: joins on to-many relations
                 * fan base rows out; `distinct: ['id']` counts base
                 * rows, not the fanned-out join product.
                 */
                distinct?: [keyof PT];
                /**
                 * Optional expression definitions. Same semantics
                 * as in other DML variants.
                 */
                expressions?: Record<string, Expressions<PT & LT>>;
                /** Optional join definitions. */
                joins?: Joins<PT, LT>;
                /** Optional row filter (pre-aggregation). */
                where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
                // NOTE: no `having` — a COUNT yields a single scalar with no
                // GROUP BY, so there is no aggregate alias to filter on. Use a
                // SELECT with `aggregates` + `having` for that. The validator
                // rejects a stray `having` on COUNT.
              }
            : never
        )
      : QT extends DDLQueries ? QT extends 'CREATE_SCHEMA' ? {
            /** Name of the schema/namespace to create. */
            schema: string;
          }
        : QT extends 'DROP_SCHEMA' ? {
            /** Name of the schema/namespace to drop. */
            schema: string;
            /**
             * When true, drop every object inside the schema.
             * When false, the schema must already be empty.
             */
            cascade?: boolean;
          }
        : QT extends 'CREATE_TABLE' ? {
            /** Name of the table to create. */
            table: string;
            /** Optional schema/namespace for the table. */
            schema?: string;
            /**
             * Column definitions keyed by column name. Each
             * column specifies its SQL type + optional length /
             * precision / scale / nullability / comment via the
             * discriminated {@link ColumnDefinition} union.
             */
            columns: Record<keyof PT, ColumnDefinition>;
            /**
             * Optional array of column names forming the primary
             * key. Single or composite.
             */
            primaryKey?: Array<keyof PT>;
            /**
             * Optional unique constraints. Constraint name →
             * column names.
             */
            uniqueKeys?: Record<string, Array<keyof PT>>;
            /**
             * Optional foreign-key constraints. Constraint name →
             * {@link ForeignKeyConstraint} definition.
             */
            foreignKeys?: Record<string, ForeignKeyConstraint<PT>>;
            /** When true, don't error if the table already exists. */
            ifNotExists?: boolean;
          }
        : QT extends 'DROP_TABLE' ? {
            /** Name of the table to drop. */
            table: string;
            /** Optional schema/namespace for the table. */
            schema?: string;
            /** When true, don't error if the table doesn't exist. */
            ifExists?: boolean;
            /**
             * When true, also drop dependent objects (views,
             * foreign keys, …). When false, the operation fails
             * if dependencies exist.
             */
            cascade?: boolean;
          }
        : QT extends 'CREATE_INDEX' ? {
            /** Name of the index. */
            index: string;
            /** Name of the table to index. */
            table: string;
            /** Optional schema/namespace for the table. */
            schema?: string;
            /** Columns to index. `@`-prefixed identifiers. */
            columns: ColumnIdentifier[];
            /**
             * Index method (`BTREE`, `HASH`, `GIN`, `GIST`,
             * `BRIN`, `FULLTEXT`). Defaults to `BTREE`.
             */
            method?: IndexMethod;
            /** When true, prevents duplicate values. */
            unique?: boolean;
            /**
             * Optional `WHERE` for partial indexes — only rows
             * matching this filter are included.
             */
            where?: QueryFilter<PT>;
            /** When true, don't error if the index already exists. */
            ifNotExists?: boolean;
          }
        : QT extends 'DROP_INDEX' ? {
            /** Name of the index. */
            index: string;
            /**
             * Owning table. Required on every dialect for API
             * uniformity, even though PostgreSQL and SQLite
             * identify indexes by name alone — MariaDB and
             * MongoDB scope indexes per-table, so the field has
             * to be present for those translators to emit valid
             * output. Postgres/SQLite ignore the value at
             * translation time.
             */
            table: string;
            /** Optional schema/namespace for the index. */
            schema?: string;
            /** When true, don't error if the index doesn't exist. */
            ifExists?: boolean;
            /**
             * When true, also drop dependent objects. When false,
             * the operation fails if dependencies exist.
             */
            cascade?: boolean;
          }
        : QT extends 'ALTER_TABLE' ? {
            /** Name of the table to alter. */
            table: string;
            /** Optional schema/namespace for the table. */
            schema?: string;
            /**
             * Optional columns to add. Same shape as
             * {@link ColumnDefinition}.
             */
            addColumns?: Record<keyof PT, ColumnDefinition>;
            /**
             * Optional column MODIFICATIONS: each entry REPLACES the
             * column's definition (type / length / nullability).
             * Postgres emits `ALTER COLUMN … TYPE … USING` casts plus
             * `SET`/`DROP NOT NULL`; MariaDB emits `MODIFY COLUMN`.
             * SQLite cannot alter a column in place (table rebuild
             * required) and throws `DialectUnsupportedError`.
             */
            alterColumns?: Record<keyof PT, ColumnDefinition>;
            /** Optional column names to remove. */
            dropColumns?: Array<keyof PT>;
            /**
             * Optional foreign-key constraints to ADD. Constraint
             * name → {@link ForeignKeyConstraint}. Postgres/MariaDB
             * only — SQLite bakes constraints into CREATE TABLE and
             * throws.
             */
            addForeignKeys?: Record<string, ForeignKeyConstraint<PT>>;
            /**
             * Optional foreign-key constraint NAMES to drop.
             * Postgres/MariaDB only.
             */
            dropForeignKeys?: string[];
            /**
             * Optional column renames. Keys are existing column
             * names; values are the new names. Emits one
             * `RENAME COLUMN` per entry. Independent of
             * `addColumns` / `dropColumns`.
             *
             * @example
             * ```ts ignore
             * { type: 'ALTER_TABLE', table: 'users',
             *   renameColumns: { email: 'email_address' } }
             * ```
             */
            renameColumns?: Record<string, string>;
            /** Optional new name for the table (rename op). */
            renameTo?: string;
          }
        : QT extends 'TRUNCATE' ? {
            /** Name of the table to truncate. */
            table: string;
            /** Optional schema/namespace for the table. */
            schema?: string;
            /**
             * When true, also truncate tables with foreign-key
             * references to this one. PostgreSQL + MariaDB/MySQL
             * support.
             */
            cascade?: boolean;
          }
        : QT extends 'CREATE_VIEW' ? {
            /** Name of the view. */
            view: string;
            /** Optional schema/namespace for the view. */
            schema?: string;
            /**
             * `SELECT` defining the view's data. The view returns
             * the result of this query.
             */
            query: Query<'SELECT', PT, LT>;
            /**
             * When true, create a materialized view (cached
             * results). When false, a regular view (dynamic
             * query).
             */
            materialized?: boolean;
            /** When true, don't error if the view already exists. */
            ifNotExists?: boolean;
            /**
             * When true, replace the view if it already exists.
             * Cannot be combined with `ifNotExists`.
             */
            orReplace?: boolean;
          }
        : QT extends 'DROP_VIEW' ? {
            /** Name of the view. */
            view: string;
            /** Optional schema/namespace for the view. */
            schema?: string;
            /**
             * The target was created `materialized: true`. Postgres
             * needs `DROP MATERIALIZED VIEW`; dialects that emulate
             * materialized views as plain views ignore the flag.
             */
            materialized?: boolean;
            /** When true, don't error if the view doesn't exist. */
            ifExists?: boolean;
            /**
             * When true, also drop dependent objects. When false,
             * the operation fails if dependencies exist.
             */
            cascade?: boolean;
          }
        : QT extends 'ALTER_VIEW' ? {
            /** Name of the view. */
            view: string;
            /** Optional schema/namespace for the view. */
            schema?: string;
            /** Optional new name for the view (rename op). */
            renameTo?: string;
            /**
             * Optional new `SELECT` to replace the view's
             * definition.
             */
            query?: Query<'SELECT', PT, LT>;
          }
        : QT extends 'REFRESH_MATERIALIZED_VIEW' ? {
            /** Name of the materialized view to refresh. */
            view: string;
            /** Optional schema/namespace for the view. */
            schema?: string;
            /**
             * When true, refresh concurrently (allows reads
             * during refresh). Requires a unique index on the
             * view. When false, takes an exclusive lock.
             */
            concurrently?: boolean;
          }
        : never
      : never
  );
