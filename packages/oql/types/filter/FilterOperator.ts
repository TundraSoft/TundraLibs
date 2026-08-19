import type { FlattenEntity } from '@tundralibs/utils';
import type { ColumnTypes } from '../common/ColumnTypes.ts';
import type { TableType } from '../common/TableType.ts';
import type { Operators } from './Operators.ts';

/**
 * Concrete column keys of a flattened table type — every key that
 * is not a catch-all index signature. A key is a catch-all when
 * `` `@${string}` `` is assignable to it: true for
 * `` [x: `@${string}`] `` and for a plain `[x: string]`, false for a
 * declared key such as `'@status'`.
 *
 * The keys are collected through a mapped type rather than by
 * filtering `keyof FT` directly. `keyof` collapses declared keys
 * into an index signature that already covers them — `keyof`
 * `` { [x: `@${string}`]: T; '@id': number } `` is just
 * `` `@${string}` `` — which would hide every concrete column. A
 * homomorphic mapped type still visits declared members
 * individually, so remapping and then taking `keyof` of the result
 * keeps them.
 *
 * @internal
 */
type ConcreteColumnKeys<FT> = keyof {
  [K in keyof FT as `@${string}` extends K ? never : K]: unknown;
};

/**
 * Filter operator for table columns. Maps each column to its
 * allowed operators based on column type. Expressions and
 * aggregates are referenced by name (validated at runtime).
 *
 * The `as` clause drops catch-all index signatures whenever the
 * schema contributes at least one concrete column. When the joined
 * tables type is left at its default, `FlattenEntity<LT, '', '@'>`
 * contributes a `` [x: `@${string}`]: TableType `` index signature.
 * Mapping over that key keeps it in the result, and TypeScript then
 * measures every specific key against it too — so
 * `'@status': 'active'` would be checked against
 * `Operators<TableType>` and rejected, breaking direct-value
 * equality on tables that declare no joins. Dropping the catch-all
 * leaves only the real column keys, which carry their real types.
 *
 * The catch-all is preserved when it is *all* there is
 * ({@link ConcreteColumnKeys} resolves to `never`), i.e. a query
 * built against the defaulted `TableType` schema rather than a
 * declared one. Such a query has no concrete keys to protect, and
 * removing its only index signature would reject every filter key
 * outright.
 *
 * **JSON-path keys** (`@col.@key` where `col` is a declared JSON
 * column with a *typed* nested shape) already appear in the flattened
 * keyspace via `FlattenEntity`, typed by the leaf's value type. Note
 * the runtime restriction is NOT expressed here: JSON-path keys accept
 * only the equality / null / membership / LIKE operator families at
 * runtime (no `$gt`/`$gte`/`$lt`/`$lte`/`$between` — extraction yields
 * dialect-dependent value types), but the type level cannot
 * distinguish a JSON path from a joined-column path (`@Alias.@col`,
 * flattened identically, where ordered comparisons remain valid), so
 * the typing stays permissive and the asserts/translators enforce the
 * restriction. Open `Record<string, unknown>` columns contribute no
 * path keys at all (FlattenEntity deliberately does not recurse into
 * open records); their runtime JSON-path filters need an untyped
 * `QueryFilter`.
 */
export type FilterOperator<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  [
    K in keyof FT as [ConcreteColumnKeys<FT>] extends [never] ? K
      : `@${string}` extends K ? never
      : K
  ]?: FT[K] extends ColumnTypes ? Operators<FT[K], T, FT> : never;
};
