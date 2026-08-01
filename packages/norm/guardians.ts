/**
 * @module
 *
 * Definition → Guardian generation. Every entity's column specs
 * compile into insert/update `ObjectGuardian`s exactly once (at
 * `use()`-time compile); repos validate payloads against them.
 *
 * - Cell rules derive from the spec's validator data (`lov`,
 *   `pattern`, `min`/`max`, `minLength`/`maxLength`, `length`,
 *   `nullable`) — the canonical stored forms rehydrate here
 *   (bigint-as-string → BigInt, ISO string → Date, pattern source →
 *   RegExp).
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

import { Guardian, GuardianError } from '@tundralibs/guardian';
import type { FinishedGuardian, ObjectGuardian } from '@tundralibs/guardian';
import type { ColumnSpec } from './definition/mod.ts';
import { isExpressionValue } from './definition/Column.ts';
import { NormValidationError } from './errors/mod.ts';
import type { ValidationIssue } from './errors/mod.ts';

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
const DATE_TYPES: ReadonlySet<string> = new Set([
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
]);

/**
 * Build the guardian for one column CELL from its spec. Validators
 * rehydrate from their canonical serialized forms; `nullable: true`
 * closes the chain with `.nullable()`.
 */
export function buildCellGuardian(spec: ColumnSpec): FinishedGuardian<unknown> {
  const base = buildBase(spec);
  return spec.nullable === true ? base.nullable() : base;
}

function buildBase(spec: ColumnSpec) {
  const type = spec.type;

  if (STRING_TYPES.has(type)) {
    let g = Guardian.string();
    // Digest columns: `length` is the DIGEST's storage size, not a
    // plaintext cap — only explicit minLength/maxLength constrain the
    // caller-supplied plaintext.
    if (typeof spec.length === 'number' && spec.hashed === undefined) {
      g = g.maxLength(spec.length);
    }
    if (typeof spec.minLength === 'number') g = g.minLength(spec.minLength);
    if (typeof spec.maxLength === 'number') g = g.maxLength(spec.maxLength);
    if (spec.pattern !== undefined) {
      g = g.pattern(new RegExp(spec.pattern.source, spec.pattern.flags));
    }
    if (spec.lov !== undefined) g = g.isIn(spec.lov as string[]);
    return g;
  }

  if (
    type === 'INTEGER' || type === 'INT' || type === 'TINYINT' ||
    type === 'SMALLINT' || type === 'BIT'
  ) {
    let g = Guardian.number().integer();
    if (typeof spec.min === 'number') g = g.min(spec.min);
    if (typeof spec.max === 'number') g = g.max(spec.max);
    if (spec.lov !== undefined) g = g.isIn(spec.lov as number[]);
    return g;
  }

  if (
    type === 'DECIMAL' || type === 'NUMERIC' || type === 'FLOAT' ||
    type === 'DOUBLE' || type === 'REAL'
  ) {
    let g = Guardian.number();
    if (typeof spec.min === 'number') g = g.min(spec.min);
    if (typeof spec.max === 'number') g = g.max(spec.max);
    if (spec.lov !== undefined) g = g.isIn(spec.lov as number[]);
    return g;
  }

  if (type === 'BIGINT') {
    let g = Guardian.bigint();
    if (spec.min !== undefined) g = g.min(BigInt(spec.min));
    if (spec.max !== undefined) g = g.max(BigInt(spec.max));
    if (spec.lov !== undefined) {
      g = g.isIn(spec.lov.map((v) => BigInt(v)));
    }
    return g;
  }

  if (DATE_TYPES.has(type)) {
    let g = Guardian.date();
    if (spec.min !== undefined) g = g.min(new Date(spec.min));
    if (spec.max !== undefined) g = g.max(new Date(spec.max));
    return g;
  }

  if (type === 'BOOLEAN') {
    return Guardian.boolean();
  }

  if (type === 'JSON' || type === 'JSONB') {
    return Guardian.unknown().refine(
      (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
      'must be a non-array object',
    );
  }

  if (type === 'BLOB' || type === 'BINARY' || type === 'VARBINARY') {
    return Guardian.unknown().refine(
      (v) => v instanceof Uint8Array,
      'must be a Uint8Array',
    );
  }

  // Unrecognised — the definition layer only emits the types above,
  // but be defensive for hand-built specs.
  return Guardian.unknown();
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
