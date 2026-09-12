/**
 * @module
 *
 * Definition → Guardian generation. Every entity's column specs
 * compile into insert/update `ObjectGuardian`s exactly once (at
 * `use()`-time compile); repos validate payloads against them.
 *
 * - The cell's real validator is `spec.guard` — an already-built
 *   Guardian from `.guard(g)` — falling back to the bare primitive
 *   guardian for the column's kind when absent. Physical guards norm
 *   itself owns (declared VARCHAR width, INTEGER integer-ness) still
 *   layer on top either way, since those protect a constraint the
 *   FACTORY declared independently of whatever `.guard()` says.
 * - DEFAULTS are applied BY the generated Guardian via
 *   `.optional(default)` — norm generates them at write time; they
 *   are never DDL. Function defaults are called per parse; literals
 *   pass through rehydration. DB-side expression defaults cannot live
 *   in a Guardian — the repo injects those after validation.
 * - Write scoping falls out structurally: `disableInsert` /
 *   `disableUpdate` columns (hash siblings, scope-excluded columns)
 *   are absent from the shape, and `.strict()` rejects unknown keys —
 *   passing an out-of-scope column is a loud validation error.
 *
 * @since 1.0.0
 */

import {
  type BigIntGuardian,
  type BooleanGuardian,
  type DateGuardian,
  EnumGuardian,
  type FinishedGuardian,
  Guardian,
  GuardianError,
  type NumberGuardian,
  type ObjectGuardian,
  type StringGuardian,
} from '@tundralibs/guardian';
import type { ColumnSpec } from './definition/mod.ts';
import { isExpressionValue } from './definition/Column.ts';
import { NormValidationError, type ValidationIssue } from './errors/mod.ts';

// Re-exported for the runtime importers (compile.ts / Repo.ts) that
// have historically pulled it from here — the ONE definition lives in
// `definition/Column.ts` (leaf; owns `ExpressionDefault`).
export { isExpressionValue };

const STRING_TYPES: ReadonlySet<string> = new Set([
  'CHAR',
  'VARCHAR',
  'TEXT',
  'CLOB',
  'UUID',
  'XML',
]);
/** Column types whose JS value is `Date`. Exported for reuse by
 * {@link Repo}'s read-path date decode — SQLite has no native
 * date/time storage, so these come back as the ISO string norm wrote,
 * not a `Date` instance. */
export const DATE_TYPES: ReadonlySet<string> = new Set([
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
]);

/**
 * Build the guardian for one column CELL from its spec: `spec.guard`
 * when the column declared one (`.guard(g)`), wrapped in norm's own
 * physical guards (declared width, integer-ness); the bare primitive
 * guardian for the kind otherwise. `nullable: true` closes the chain
 * with `.nullable()`.
 */
export function buildCellGuardian(spec: ColumnSpec): FinishedGuardian<unknown> {
  const base = buildBase(spec);
  return spec.nullable === true ? base.nullable() : base;
}

function buildBase(spec: ColumnSpec) {
  // Column.enum(values) already computed the right physical width from
  // the values themselves — an EnumGuardian is never the concrete class
  // (StringGuardian/NumberGuardian/…) the per-kind branches below
  // assume, so it short-circuits BEFORE any of them cast and call a
  // method the class doesn't have.
  if (spec.guard instanceof EnumGuardian) return spec.guard;

  const type = spec.type;

  if (STRING_TYPES.has(type)) {
    let g = (spec.guard as StringGuardian | undefined) ?? Guardian.string();
    // Digest columns: `length` is the DIGEST's storage size, not a
    // plaintext cap — a `.guard()` constrains the caller-supplied
    // plaintext instead. Otherwise the declared VARCHAR width is
    // enforced regardless of what `.guard()` says, so a looser guard
    // can never let a value through the physical column can't hold.
    if (typeof spec.length === 'number' && spec.hashed === undefined) {
      g = g.maxLength(spec.length);
    }
    return g;
  }

  if (
    type === 'INTEGER' || type === 'INT' || type === 'TINYINT' ||
    type === 'SMALLINT' || type === 'BIT'
  ) {
    return ((spec.guard as NumberGuardian | undefined) ?? Guardian.number())
      .integer();
  }

  if (
    type === 'DECIMAL' || type === 'NUMERIC' || type === 'FLOAT' ||
    type === 'DOUBLE' || type === 'REAL'
  ) {
    return (spec.guard as NumberGuardian | undefined) ?? Guardian.number();
  }

  if (type === 'BIGINT') {
    return (spec.guard as BigIntGuardian | undefined) ?? Guardian.bigint();
  }

  if (DATE_TYPES.has(type)) {
    return (spec.guard as DateGuardian | undefined) ?? Guardian.date();
  }

  if (type === 'BOOLEAN') {
    return (spec.guard as BooleanGuardian | undefined) ?? Guardian.boolean();
  }

  if (type === 'JSON' || type === 'JSONB') {
    // Column.json(schema) — the schema IS the real per-key validator;
    // no forced .strict()/.strip(), the caller's own guardian already
    // chose that.
    if (spec.jsonSchema !== undefined) return spec.jsonSchema;
    if (spec.guard !== undefined) return spec.guard;
    return Guardian.unknown().refine(
      (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
      'must be a non-array object',
    );
  }

  if (type === 'BLOB' || type === 'BINARY' || type === 'VARBINARY') {
    if (spec.guard !== undefined) return spec.guard;
    return Guardian.unknown().refine(
      (v) => v instanceof Uint8Array,
      'must be a Uint8Array',
    );
  }

  // Unrecognised — the definition layer only emits the types above,
  // but be defensive for hand-built specs.
  return spec.guard ?? Guardian.unknown();
}

/**
 * Rehydrate a stored literal default to the column's JS value type
 * (bigint-as-string → BigInt, ISO string → Date). Functions pass
 * through untouched (called by the Guardian per parse).
 */
export function rehydrateDefault(spec: ColumnSpec, v: unknown): unknown {
  if (typeof v === 'function') return v;
  if (spec.type === 'BIGINT' && typeof v === 'string') return BigInt(v);
  if (DATE_TYPES.has(spec.type) && typeof v === 'string') return new Date(v);
  return v;
}

/** The pair of write guardians compiled per TABLE entity. */
export type WriteGuardians = {
  readonly insert: ObjectGuardian<Record<string, unknown>>;
  readonly update: ObjectGuardian<Record<string, unknown>>;
};

/**
 * Compose per-column guardians into the entity's insert and update
 * guardians.
 *
 * - Insert: `disableInsert` columns excluded. A column is optional
 *   when nullable or defaulted; JS defaults (literal / function) ride
 *   on `.optional(default)` so THE GUARDIAN fills them; expression
 *   defaults leave the column plain-optional (repo injects the marker
 *   after validation).
 * - Update: `disableUpdate` columns excluded; everything optional.
 *   `defaultOnUpdate` rides on `.optional(default)` — the auto-touch
 *   IS the guardian filling the missing value.
 * - Both `.strict()`: unknown keys (out-of-scope columns included)
 *   are loud errors.
 */
export function buildWriteGuardians(
  columns: Record<string, ColumnSpec>,
): WriteGuardians {
  const insertShape: Record<string, FinishedGuardian<unknown>> = {};
  const updateShape: Record<string, FinishedGuardian<unknown>> = {};

  for (const [name, spec] of Object.entries(columns)) {
    if (spec.disableInsert !== true) {
      const cell = buildCellGuardian(spec);
      const d = spec.default?.insert;
      if (d !== undefined && !isExpressionValue(d)) {
        insertShape[name] = cell.optional(
          rehydrateDefault(spec, d) as never,
        );
      } else if (spec.nullable === true || d !== undefined) {
        insertShape[name] = cell.optional();
      } else {
        insertShape[name] = cell;
      }
    }
    if (spec.disableUpdate !== true) {
      const cell = buildCellGuardian(spec);
      const d = spec.default?.update;
      updateShape[name] = d !== undefined && !isExpressionValue(d)
        ? cell.optional(rehydrateDefault(spec, d) as never)
        : cell.optional();
    }
  }

  return {
    insert: Guardian.object(insertShape).strict() as ObjectGuardian<
      Record<string, unknown>
    >,
    update: Guardian.object(updateShape).strict() as ObjectGuardian<
      Record<string, unknown>
    >,
  };
}

/**
 * Validate one or more row payloads against `guardian`, translating
 * failures into a {@link NormValidationError} with structured
 * per-field issues. Returns the PARSED rows — Guardian-applied
 * defaults included.
 *
 * For batched inserts the leaf path is prefixed `[<i>].` so callers
 * can locate the bad row.
 */
export function validateRows(
  guardian: ObjectGuardian<Record<string, unknown>>,
  rows: ReadonlyArray<Record<string, unknown>>,
  meta: { model: string; op: 'insert' | 'update' | 'upsert' },
  isBatch: boolean,
): Record<string, unknown>[] {
  const issues: ValidationIssue[] = [];
  let firstError: GuardianError | undefined;
  const parsed: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      parsed.push(guardian.parse(rows[i]) as Record<string, unknown>);
    } catch (e) {
      if (!(e instanceof GuardianError)) throw e;
      firstError ??= e;
      const prefix = isBatch ? `[${i}].` : '';
      for (const { path, error } of e.leafErrors()) {
        // Strict-mode unknown-key rejections surface as ONE root-level
        // error whose context carries the offending keys — emit one
        // ADDRESSABLE issue per key instead of a dangling '' path.
        const ctx = (error as {
          context?: { type?: string; got?: unknown };
        }).context;
        if (ctx?.type === 'unknown_property' && Array.isArray(ctx.got)) {
          for (const key of ctx.got as string[]) {
            issues.push({
              model: meta.model,
              op: meta.op,
              path: prefix + key,
              message: error.message,
            });
          }
          continue;
        }
        issues.push({
          model: meta.model,
          op: meta.op,
          path: prefix + path.join('.'),
          message: error.message,
        });
      }
    }
  }
  if (issues.length > 0) {
    throw new NormValidationError({ issues }, firstError);
  }
  return parsed;
}
