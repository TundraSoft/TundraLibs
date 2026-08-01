/**
 * @module
 *
 * Scoping — an implicit, always-on EQUALITY filter merged into every
 * operation of a `db.scope(...)` handle. One primitive covers tenant
 * scoping and default filters: `db.scope({ '@orgId': 42 })` makes every
 * find/count/update/delete/insert carry `orgId = 42` automatically.
 *
 * A scope is ALWAYS runtime state on a handle — there is deliberately
 * no entity-level static `scope` preset. A definition-time preset would
 * be invisible at the call site and impossible to type, so the design
 * settled on the typed scoped handle instead: `db.scope(...)` returns a
 * handle whose insert types relax for the scoped columns, and
 * {@linkcode mergeScope} composes nested handles.
 *
 * DESIGN RULES (ratified):
 * - EQUALITY ONLY. A scope value is a bare primitive (`{ '@orgId': 42 }`)
 *   — not an operator object, not an array. A scope is an identity
 *   partition, not a query, which is what makes it safe to auto-fill on
 *   insert and unambiguous to merge.
 * - GRACEFUL. A scope column that an entity does not have is simply
 *   skipped for that entity (it is queried unscoped for that key), so
 *   one scope handle works across a mixed registry.
 * - WRITES included. insert auto-fills the scope columns; update
 *   enforces the scope in its WHERE and rejects a payload that would
 *   move a row out of scope; delete/find/count constrain the WHERE.
 *
 * @since 1.0.0
 */

import { NormQueryError } from './errors/mod.ts';

/** A single scope value — equality only (no operators, no arrays). */
export type ScopeValue = string | number | bigint | boolean | Date | null;

/** What a caller passes to `db.scope(...)` — `@column` keys, primitive
 * values. */
export type ScopeInput = Readonly<Record<`@${string}`, ScopeValue>>;

/** Normalized scope: plain column name → value. */
export type NormScope = ReadonlyMap<string, ScopeValue>;

/** Type-level: the `@`-stripped column keys of a scope input literal
 * (`{ '@orgId': 42 }` → `'orgId'`). Drives the scoped-insert
 * relaxation on the typed handle. */
export type ScopeKeysOf<S> = {
  [K in keyof S]: K extends `@${infer C}` ? C : never;
}[keyof S];

function isScopeValue(v: unknown): v is ScopeValue {
  return v === null ||
    typeof v === 'string' || typeof v === 'number' ||
    typeof v === 'bigint' || typeof v === 'boolean' ||
    v instanceof Date;
}

/**
 * Validate + normalize a scope spec from `db.scope(...)`. Keys must be
 * single-segment `@column` refs (no relations); values must be bare
 * equality primitives.
 *
 * @param input - The raw `{ '@column': value }` spec.
 * @param origin - Label used in error messages (the call site).
 * @throws {NormQueryError} `SCOPE_VIOLATION` when a key is not a
 *   single-segment `@column` ref, or a value is not an equality
 *   primitive.
 */
export function normalizeScope(
  input: Record<string, unknown>,
  origin: string,
): Map<string, ScopeValue> {
  const out = new Map<string, ScopeValue>();
  for (const [key, value] of Object.entries(input)) {
    if (!key.startsWith('@') || key.includes('.')) {
      throw new NormQueryError(
        `${origin}: scope key '${key}' must be a single '@column' ` +
          `reference — scopes are local columns only, no relations.`,
        { entity: origin, subject: key, code: 'SCOPE_VIOLATION' },
      );
    }
    if (!isScopeValue(value)) {
      throw new NormQueryError(
        `${origin}: scope value for '${key}' must be an equality ` +
          `primitive (string/number/bigint/boolean/Date/null) — ` +
          `operators and arrays are not allowed in a scope.`,
        { entity: origin, subject: key, code: 'SCOPE_VIOLATION' },
      );
    }
    out.set(key.slice(1), value);
  }
  return out;
}

/** Merge a child scope over a parent (child wins on key collision) —
 * this is what makes `db.scope(a).scope(b)` compose. */
export function mergeScope(
  parent: NormScope | undefined,
  child: NormScope | undefined,
): NormScope | undefined {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  const out = new Map(parent);
  for (const [k, v] of child) out.set(k, v);
  return out;
}
