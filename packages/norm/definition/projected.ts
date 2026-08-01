/**
 * @module
 *
 * `ProjectedRowOf` — the typed return shape of a projected `find()`.
 *
 * Given the composed registry `R`, the entity's key `Self`, and the
 * projection literal `P` (captured `const` at the call site), this
 * derives exactly what the runtime returns:
 *
 * - local columns at their column types, renames honored
 *   (`{'@title': 'headline'}` → `{ headline: string }`);
 * - FK aliases (belongsTo) as `object | null` — whole-relation
 *   (`true` / rename) yields the target's default-read row
 *   ({@linkcode ReadRowOf}: hidden columns excluded), sub-projections
 *   yield the picked/renamed subset;
 * - reverse relations resolved across the registry from the emitted
 *   FK literals: `hasMany` → array, `hasOne` → `object | null`
 *   (explicit `reverseCardinality` wins; otherwise derived from
 *   FK-columns-equal-source-pk).
 *
 * Structure note: each relation is resolved through a SINGLE-PURPOSE
 * helper (`_RelValue`) rather than inline nested conditionals — deep
 * inline nesting made TS silently bail to `unknown`. Keep the nesting
 * shallow if you extend this.
 *
 * Reverse-name collisions (two FKs sharing the same source and target
 * without `reverseAs`) are a loud compile-time error at composition,
 * not a silent gap — declare `reverseAs` on one of them. Every reverse
 * name that compiles resolves here, so this type and the runtime agree.
 */

import type { ColumnSpec } from './Column.ts';
import type { ReadRowOf } from './infer.ts';

/** Caller-facing projection literal: `{'@col': true | 'rename',
 * '@Alias': true | 'rename' | {'@col': true | 'rename'}}`. */
export type ProjectionInput = Record<
  string,
  true | string | Record<string, true | string>
>;

type _Prettify<T> = { [K in keyof T]: T[K] };
type _WithColumns = { readonly columns: Record<string, ColumnSpec> };
type _TypeOf<S> = S extends ColumnSpec<infer T, boolean> ? T : never;
type _Strip<K> = K extends `@${infer C}` ? C : never;

/** Column keys carrying the virtual-mask brand.
 * @internal Shared with the filter surface. */
export type _MaskedKeysOf<D> = D extends _WithColumns ? {
    [K in keyof D['columns']]: D['columns'][K] extends
      { readonly masked: { readonly source: string } } ? K : never;
  }[keyof D['columns']]
  : never;

/** The emitted FK map. `foreignKeys` is OPTIONAL on the definition,
 * so match `?` and strip `| undefined`. When there are NO FKs the
 * property type is `undefined` → must collapse to an EMPTY object,
 * not `never`: `keyof never` is `PropertyKey`, which would make the
 * belongsTo-exclusion check match every key and drop all relations.
 * @internal Shared with the filter surface (filter.ts). */
export type _FksOf<D> = D extends { readonly foreignKeys?: infer F }
  ? ([F] extends [undefined] ? Record<never, never> : NonNullable<F>)
  : Record<never, never>;

/** Column keys of a definition. */
type _ColsOf<D> = D extends _WithColumns ? keyof D['columns'] : never;

// ─── Related-row shaping ─────────────────────────────────────────────

/** Sub-projection over a relation target — picked + renamed columns.
 * `-readonly` because it maps over the `const`-captured projection
 * literal (homomorphic mapped types copy readonly) but result rows
 * are plain mutable objects. */
type _SubPick<TD extends _WithColumns, Sub> = _Prettify<
  {
    -readonly [
      SK in keyof Sub as _Strip<SK> extends keyof TD['columns']
        ? (Sub[SK] extends string ? Sub[SK] : _Strip<SK>)
        : never
    ]: _TypeOf<TD['columns'][_Strip<SK> & keyof TD['columns']]>;
  }
>;

/** One related row: whole-relation → default-read row; sub-projection
 * → the picked subset. */
// (probe exports removed after verification)
type _RelShape<TD, PV> = TD extends _WithColumns
  ? PV extends true | string ? ReadRowOf<TD>
  : PV extends Record<string, true | string> ? _SubPick<TD, PV>
  : never
  : never;

// ─── Relation resolution (one shallow helper each) ───────────────────

/** Target REGISTRY KEY of an FK alias `A` on definition `D`. */
type _FkTarget<D, A> = _FksOf<D>[A & keyof _FksOf<D>] extends
  { readonly model: infer M extends string } ? M : never;

/** The belongsTo value for FK alias `A` with projection `PV`. */
type _BtValue<R, D, A, PV> = _FkTarget<D, A> extends infer M
  ? M extends keyof R ? _RelShape<R[M], PV> | null
  : never
  : never;

type _U2I<U> = (U extends unknown ? (x: U) => void : never) extends
  (x: infer I) => void ? I : never;
type _IsSingle<U> = [U] extends [never] ? false
  : [U] extends [_U2I<U>] ? true
  : false;

/** Aliases of UNNAMED (no `reverseAs`) FKs on `F` targeting `Self`. */
type _UnnamedTo<F, Self> = {
  [A in keyof F]: F[A] extends { readonly model: Self }
    ? F[A] extends { readonly reverseAs: string } ? never : A
    : never;
}[keyof F];

/** The reverse name FK `A` of `F` derives, mirroring buildReverseMap's
 * runtime naming: explicit `reverseAs` wins; a SINGLE unnamed FK gets
 * the bare source key; MULTIPLE unnamed FKs to the same target all
 * auto-qualify as `<SrcK>_via_<alias>` — offering the bare name in
 * that case would fabricate a field the runtime never registers.
 * @internal Shared with the filter surface. */
export type _RevNameOf<F, A, SrcK extends string, Self> = F[A & keyof F] extends
  { readonly reverseAs: infer N extends string } ? N
  : _IsSingle<_UnnamedTo<F, Self>> extends true ? SrcK
  : `${SrcK}_via_${A & string}`;

/** Does reverse `Name` match FK `A` of `F`? */
type _NameMatches<F, A, SrcK extends string, Self, Name> = Name extends
  _RevNameOf<F, A, SrcK, Self> ? true : false;

type _SetEq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false)
  : false;

/** Reverse cardinality: explicit `reverseCardinality` wins; else
 * hasOne iff the FK's local columns equal the source's primary key. */
/** @internal Shared with the filter surface. */
export type _RevCard<FK, Src> = FK extends
  { readonly reverseCardinality: infer C extends 'hasOne' | 'hasMany' } ? C
  : Src extends { readonly primaryKeys: infer PK extends readonly string[] }
    ? FK extends { readonly on: infer On }
      ? _SetEq<keyof On, PK[number]> extends true ? 'hasOne' : 'hasMany'
    : 'hasMany'
  : 'hasMany';

/** The `{ src, fk }` whose FK derives reverse `Name` on `Self`. */
/** @internal Shared with the filter surface. */
export type _RevHit<R, Self, Name> = {
  [SrcK in keyof R & string]: {
    [A in keyof _FksOf<R[SrcK]>]: _FksOf<R[SrcK]>[A] extends
      { readonly model: Self }
      ? _NameMatches<_FksOf<R[SrcK]>, A, SrcK, Self, Name> extends true
        ? { readonly src: SrcK; readonly fk: _FksOf<R[SrcK]>[A] }
      : never
      : never;
  }[keyof _FksOf<R[SrcK]>];
}[keyof R & string];

/** The reverse-relation value for reverse name `Name` with `PV`. */
type _RevValue<R, Self, Name, PV> = _RevHit<R, Self, Name> extends
  { readonly src: infer SrcK extends keyof R; readonly fk: infer FK }
  ? _RevCard<FK, R[SrcK]> extends 'hasOne' ? _RelShape<R[SrcK], PV> | null
  : _RelShape<R[SrcK], PV>[]
  : never;

// ─── Row assembly (locals + belongsTo + reverse) ─────────────────────

/** Local column part — renames honored, non-column keys excluded.
 * `-readonly`: maps over the `const`-captured projection literal but
 * yields plain mutable result rows. */
type _Locals<D, P> = {
  -readonly [
    K in keyof P as _Strip<K> extends _ColsOf<D>
      ? (P[K] extends string ? P[K] : _Strip<K>)
      : never
  ]: _TypeOf<(D & _WithColumns)['columns'][_Strip<K> & _ColsOf<D>]>;
};

/** belongsTo part — FK aliases; always `object | null` (LEFT join). */
type _BelongsTo<R, D, P> = {
  -readonly [
    K in keyof P as _Strip<K> extends _ColsOf<D> ? never
      : _Strip<K> extends keyof _FksOf<D>
        ? (P[K] extends string ? P[K] : _Strip<K>)
      : never
  ]: _BtValue<R, D, _Strip<K> & keyof _FksOf<D>, P[K]>;
};

/** Reverse-relation part — resolved across the registry. */
type _Reverse<R, Self, D, P> = {
  -readonly [
    K in keyof P as _Strip<K> extends _ColsOf<D> ? never
      : _Strip<K> extends keyof _FksOf<D> ? never
      : [_RevHit<R, Self, _Strip<K>>] extends [never] ? never
      : (P[K] extends string ? P[K] : _Strip<K>)
  ]: _RevValue<R, Self, _Strip<K>, P[K]>;
};

/**
 * The typed rows a projected `find()` returns. `P === undefined`
 * (no projection) falls back to the default-read shape.
 */
export type ProjectedRowOf<
  R,
  Self extends keyof R,
  P,
> = P extends undefined ? DefaultRowOf<R, Self>
  : _Prettify<
    & _Locals<R[Self], P>
    & _BelongsTo<R, R[Self], P>
    & _Reverse<R, Self, R[Self], P>
  >;

/** Eager belongsTo part of the DEFAULT-read row: FK aliases declared
 * `project: true` as target default rows (`object | null`). */
type _EagerBt<R, D> = {
  -readonly [
    A in keyof _FksOf<D> as _FksOf<D>[A] extends { readonly project: true } ? A
      : never
  ]: _FkTarget<D, A> extends infer M
    ? M extends keyof R
      ? R[M] extends _WithColumns ? ReadRowOf<R[M]> | null : never
    : never
    : never;
};

/** Reverse names on `Self` whose FK declared `reverseProject: true`. */
type _EagerRevNames<R, Self> = {
  [SrcK in keyof R & string]: {
    [A in keyof _FksOf<R[SrcK]>]: _FksOf<R[SrcK]>[A] extends
      { readonly model: Self; readonly reverseProject: true }
      ? _RevNameOf<_FksOf<R[SrcK]>, A, SrcK, Self>
      : never;
  }[keyof _FksOf<R[SrcK]>];
}[keyof R & string];

/** Eager hasOne-reverse part of the DEFAULT-read row. */
type _EagerRev<R, Self> = {
  -readonly [N in _EagerRevNames<R, Self> & string]: _RevHit<
    R,
    Self,
    N
  > extends { readonly src: infer S extends keyof R }
    ? R[S] extends _WithColumns ? ReadRowOf<R[S]> | null : never
    : never;
};

/**
 * The DEFAULT (projection-less) read row: the entity's own
 * {@linkcode ReadRowOf} plus EAGER relations — belongsTo aliases with
 * `project: true` and hasOne reverses with `reverseProject: true`,
 * each as the target's LOCAL default row (`object | null`, depth-1:
 * eager never recurses). Write RETURNING stays {@linkcode ReadRowOf}
 * — RETURNING cannot join.
 */
export type DefaultRowOf<R, Self extends keyof R> = _Prettify<
  // Conditional, NOT `& _WithColumns`: intersecting the columns
  // record with Record<string, ColumnSpec> widens `keyof columns` to
  // string and hidden()-key exclusion dissolves into an index
  // signature.
  & (R[Self] extends _WithColumns ? ReadRowOf<R[Self]> : Record<never, never>)
  & _EagerBt<R, R[Self]>
  & _EagerRev<R, Self>
>;

/** Projection input for one RELATION target: whole / rename / picked
 * target columns. */
type _RelProjInput<R, TK> = TK extends keyof R ?
    | true
    | string
    | {
      [
        K in `@${Exclude<_ColsOf<R[TK]>, _MaskedKeysOf<R[TK]>> & string}`
      ]?: true | string;
    }
  : true | string | Record<string, true | string>;

/**
 * COMPILE-TIME projection validation: every key must name a local
 * column, an FK alias, or a resolvable reverse relation; relation
 * sub-projection keys must name TARGET columns. Invalid keys map to
 * `never`, so the literal errors right at the bad key instead of
 * throwing at runtime.
 */
export type ValidProjection<R, Self extends keyof R, P> = {
  [K in keyof P]: K extends `@${infer C}`
    ? C extends _ColsOf<R[Self]> & string ? true | string
    : C extends keyof _FksOf<R[Self]> & string
      ? _RelProjInput<R, _FkTarget<R[Self], C>>
    : [_RevHit<R, Self, C>] extends [never] ? never
    : _RevHit<R, Self, C> extends
      { readonly src: infer S extends keyof R; readonly fk: unknown }
      ? _RelProjInput<R, S>
    : never
    : never;
};
