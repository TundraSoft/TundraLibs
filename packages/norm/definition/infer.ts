/**
 * @module
 *
 * Row / payload shapes derived from a definition.
 *
 * These read the builders' PHANTOM types (`$type`, `$insertOptional`)
 * off the emitted column specs — no decoding of raw literals, no
 * `as const` discipline required from authors. This is the payoff of
 * the builder API: the whole derivation layer is this one small file.
 *
 * @since 1.0.0
 */

import type { ColumnSpec } from './Column.ts';

/** Flatten intersections/Picks into a single readable object type. */
type _Prettify<T> = { [K in keyof T]: T[K] };

/** Any definition with columns (table or view). */
type _WithColumns = { readonly columns: Record<string, ColumnSpec> };

/** A spec's TS value type (includes `| null` when nullable). */
type _TypeOf<S> = S extends ColumnSpec<infer T, infer _O> ? T : never;

/** Is the column omittable on insert (nullable or defaulted)? */
type _OptionalOnInsert<S> = S extends ColumnSpec<infer _T, infer O>
  ? O extends true ? true : false
  : false;

/** Keys excluded from caller payloads (norm-owned columns). */
type _DisabledKeys<
  D extends _WithColumns,
  Flag extends 'disableInsert' | 'disableUpdate',
> = {
  [K in keyof D['columns']]: D['columns'][K] extends
    { readonly [F in Flag]: true } ? K : never;
}[keyof D['columns']];

/**
 * Complete row shape — every column (synthesized hash siblings
 * included) at its derived TS value type.
 *
 * ```ts ignore
 * type UserRow = RowOf<typeof Users>;
 * // { id: string; email: string; email_hash: string; age: number | null }
 * ```
 */
export type RowOf<D extends _WithColumns> = _Prettify<
  { -readonly [K in keyof D['columns']]-?: _TypeOf<D['columns'][K]> }
>;

/** Keys hidden from default reads (`.hidden()` → `project: false`). */
type _HiddenKeys<D extends _WithColumns> = {
  [K in keyof D['columns']]: D['columns'][K] extends { readonly project: false }
    ? K
    : never;
}[keyof D['columns']];

/**
 * The DEFAULT-READ row shape: what `find()` returns and what RETURNING
 * rows look like — {@linkcode RowOf} minus `.hidden()` columns
 * (explicit projection still opts them in at runtime).
 */
export type ReadRowOf<D extends _WithColumns> = _Prettify<
  {
    -readonly [K in Exclude<keyof D['columns'], _HiddenKeys<D>>]-?: _TypeOf<
      D['columns'][K]
    >;
  }
>;

/**
 * Insert payload shape: columns with a default or `nullable()` are
 * optional; norm-owned columns (hash siblings) are excluded entirely.
 */
export type InsertOf<D extends _WithColumns> = _Prettify<
  & {
    -readonly [
      K in keyof D['columns'] as K extends _DisabledKeys<D, 'disableInsert'>
        ? never
        : _OptionalOnInsert<D['columns'][K]> extends true ? never
        : K
    ]-?: _TypeOf<D['columns'][K]>;
  }
  & {
    -readonly [
      K in keyof D['columns'] as K extends _DisabledKeys<D, 'disableInsert'>
        ? never
        : _OptionalOnInsert<D['columns'][K]> extends true ? K
        : never
    ]?: _TypeOf<D['columns'][K]>;
  }
>;

/**
 * `InsertOf<D>` with the scoped columns RELAXED to optional — the
 * typed shape a `db.scope(...)` repo accepts. A scope column the
 * runtime auto-fills need not be passed (but MAY be, and must match).
 * `Scope` is the union of scoped column names; only those that exist
 * in `InsertOf<D>` are relaxed (graceful). `never` = unscoped.
 */
export type ScopedInsertOf<D extends _WithColumns, Scope extends string> =
  [Scope] extends [never] ? InsertOf<D>
    : _Prettify<
      & Omit<InsertOf<D>, Scope>
      & { [K in Scope & keyof InsertOf<D>]?: InsertOf<D>[K] }
    >;

/**
 * Update payload shape: everything optional; norm-owned columns
 * excluded.
 */
export type UpdateOf<D extends _WithColumns> = _Prettify<
  {
    -readonly [
      K in keyof D['columns'] as K extends _DisabledKeys<D, 'disableUpdate'>
        ? never
        : K
    ]?: _TypeOf<D['columns'][K]>;
  }
>;

/**
 * The primary-key tuple as an object — what `findByPK` / `updateByPK`
 * accept. Derived from the `.pk()` flags via the definition's
 * `primaryKeys` tuple type.
 */
export type PrimaryKeyOf<
  D extends _WithColumns & { readonly primaryKeys: ReadonlyArray<string> },
> = _Prettify<
  {
    [K in D['primaryKeys'][number] & keyof D['columns']]: _TypeOf<
      D['columns'][K]
    >;
  }
>;
