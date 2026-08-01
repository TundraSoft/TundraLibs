/**
 * @module
 *
 * `FilterOf` — the COMPILE-TIME filter surface. Builds the OQL
 * `TableType` shape straight off the entity's specs and rides OQL's
 * own `QueryFilter` typing:
 *
 * - local columns at their value types (phantom-derived, so lov
 *   unions, Date, bigint all check) — typos are compile errors;
 * - `.encrypt().hash()` columns typed by PLAINTEXT (the runtime
 *   rewrite hashes them);
 * - FK aliases and reverse relations as nested shapes —
 *   `FlattenEntity` renders them as `@Alias.@col`, exactly OQL's
 *   joined syntax. (hasMany refs are CONTEXTUAL: legal when the
 *   relation is also projected — its aggregate GROUP-BYs — and
 *   rejected at runtime in filter-only position, which a filter type
 *   cannot see.)
 *
 * Policy rules without type-level brands (explicit `unfilterable()`,
 * encrypt-without-hash) remain RUNTIME-guarded — `NormQueryError`
 * before any engine call.
 *
 * @since 1.0.0
 */

import type { QueryFilter, TableType } from '@tundralibs/oql/types';
import type { ColumnSpec } from './Column.ts';
import type {
  _FksOf,
  _MaskedKeysOf,
  _RevCard,
  _RevHit,
  _RevNameOf,
} from './projected.ts';

type _WithColumns = { readonly columns: Record<string, ColumnSpec> };
type _TypeOf<S> = S extends ColumnSpec<infer T, boolean> ? T : never;

/** Filterable local columns → non-null value types (null is filtered
 * via the `$null` operator, not value position). */
type _LocalShape<D> = D extends _WithColumns ? {
    [
      K in Exclude<keyof D['columns'], _MaskedKeysOf<D>>
    ]: NonNullable<_TypeOf<D['columns'][K]>>;
  }
  : Record<never, never>;

/** FK aliases as nested shapes → flatten to `@Alias.@col`. */
type _FkNest<R, D> = {
  [A in keyof _FksOf<D>]: _FksOf<D>[A] extends
    { readonly model: infer M extends string }
    ? M extends keyof R ? _LocalShape<R[M]> : Record<never, never>
    : never;
};

/** Every reverse-relation NAME derived on `Self` across the registry. */
type _RevNames<R, Self> = {
  [SrcK in keyof R & string]: {
    [A in keyof _FksOf<R[SrcK]>]: _FksOf<R[SrcK]>[A] extends
      { readonly model: Self } ? _RevNameOf<_FksOf<R[SrcK]>, A, SrcK, Self>
      : never;
  }[keyof _FksOf<R[SrcK]>];
}[keyof R & string];

/** Reverse relations as nested shapes (hasMany included — its
 * filter-ONLY rejection is contextual, enforced at runtime). */
type _RevNest<R, Self> = {
  [N in _RevNames<R, Self> & string]: _RevHit<R, Self, N> extends
    { readonly src: infer S extends keyof R } ? _LocalShape<R[S]>
    : never;
};

/** The OQL TableType shape of one entity within registry `R`. */
export type FilterShapeOf<R, Self extends keyof R> =
  & _LocalShape<R[Self]>
  & _FkNest<R, R[Self]>
  & _RevNest<R, Self>;

/**
 * Typed filter for one entity: OQL's `QueryFilter` over the derived
 * shape — `$and`/`$or` composition, per-column operators typed by
 * value, joined refs as `@Alias.@col` (via FlattenEntity). Falls back
 * to the untyped `QueryFilter` only if the derived shape cannot
 * satisfy OQL's `TableType` constraint (erased/generic registries).
 */
export type FilterOf<R, Self extends keyof R> = FilterShapeOf<R, Self> extends
  TableType ? QueryFilter<FilterShapeOf<R, Self>>
  : QueryFilter;
