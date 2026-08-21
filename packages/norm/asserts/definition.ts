/**
 * @module
 *
 * Whole-definition assertion — every structural rule an EMITTED
 * definition must satisfy, in one place. `Entity()` delegates here
 * after construction; `compileRuntime()` re-runs it so hand-built
 * definitions (no builders, no `Entity()`) get identical validation.
 *
 * Messages are the exact strings `Entity()` historically threw — the
 * test suites pin them.
 *
 * @since 1.0.0
 */

import { type ColumnSpec, hashSourceOf } from '../definition/Column.ts';
import type { EmittedForeignKey } from '../definition/entity.ts';
import type { AnyDefinition } from '../definition/schema.ts';
import { type DefinitionIssue, NormDefinitionError } from '../errors/mod.ts';
import { columnSpecIssues } from './column.ts';

type TableLike = AnyDefinition & {
  primaryKeys?: readonly string[];
  foreignKeys?: Record<string, EmittedForeignKey>;
  indexes?: Record<string, readonly string[]>;
  uniques?: Record<string, readonly string[]>;
  renamedFrom?: string;
  query?: { type?: string };
  hooks?: { beforeInsert?: unknown; beforeUpdate?: unknown };
};

const FK_ACTIONS: ReadonlySet<string> = new Set([
  'CASCADE',
  'RESTRICT',
  'NO_ACTION',
  'SET_NULL',
]);

/** Every single-definition rule (columns, pk, fk, indexes, scope,
 * hooks), collected as aggregatable issues — the single source
 * `Entity()` and `compileRuntime()` both delegate to. */
export function definitionIssues(def: AnyDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const d = def as TableLike;
  const name = def.name;
  const specs = def.columns as Record<string, ColumnSpec>;
  const at = (path: string, message: string) =>
    issues.push({ model: name, path, message });

  // ── Per-column rules ────────────────────────────────────────────
  const renameSources = new Map<string, string>();
  for (const [colName, spec] of Object.entries(specs)) {
    issues.push(...columnSpecIssues(name, colName, spec));

    if (
      def.type !== 'TABLE' &&
      (spec.default !== undefined || spec.transforms?.beforeWrite)
    ) {
      at(
        `columns.${colName}`,
        `Entity('${name}').columns.${colName}: write-side declarations ` +
          `(default / beforeWrite) are meaningless on a read-only ` +
          `${def.type}.`,
      );
    }
    if (spec.renamedFrom !== undefined && spec.renamedFrom !== colName) {
      const prior = renameSources.get(spec.renamedFrom);
      if (prior !== undefined) {
        at(
          `columns.${colName}.renamedFrom`,
          `Entity('${name}'): columns '${prior}' and '${colName}' both ` +
            `claim renamedFrom '${spec.renamedFrom}'.`,
        );
      }
      renameSources.set(spec.renamedFrom, colName);
    }
    if (spec.masked !== undefined) {
      if (spec.masked.source === colName) {
        at(
          `columns.${colName}.masked`,
          `Entity('${name}').columns.${colName}: a mask cannot source ` +
            `itself.`,
        );
      } else {
        const source = specs[spec.masked.source];
        if (source === undefined) {
          at(
            `columns.${colName}.masked`,
            `Entity('${name}').columns.${colName}: mask source ` +
              `'${spec.masked.source}' does not exist.`,
          );
        } else if (source.masked !== undefined) {
          at(
            `columns.${colName}.masked`,
            `Entity('${name}').columns.${colName}: mask source ` +
              `'${spec.masked.source}' is itself a mask — chains are not ` +
              `allowed.`,
          );
        }
      }
    }
  }

  // Foreign-key rules — shared by TABLE (physical FKs) and VIEW
  // (LOGICAL, join-only FKs). `pkCols` drives the hasOne derivation;
  // views pass [] (no pk), so their reverses derive hasMany and
  // reverseProject demands an EXPLICIT reverseCardinality: 'hasOne'.
  const fkRules = (pkCols: readonly string[]) => {
    for (const [alias, fk] of Object.entries(d.foreignKeys ?? {})) {
      if (alias in specs) {
        at(
          `fk.${alias}`,
          `Entity('${name}').fk.${alias}: alias collides with column ` +
            `'${alias}' — rename the alias.`,
        );
      }
      const pairs = Object.entries(fk.on ?? {});
      if (pairs.length === 0) {
        at(
          `fk.${alias}.on`,
          `Entity('${name}').fk.${alias}: 'on' must map at least one ` +
            `column pair`,
        );
      }
      for (const [local, remote] of pairs) {
        if (!(local in specs)) {
          at(
            `fk.${alias}.on.${local}`,
            `Entity('${name}').fk.${alias}: local column '${local}' ` +
              `does not exist`,
          );
        } else if (specs[local]!.masked !== undefined) {
          at(
            `fk.${alias}.on.${local}`,
            `Entity('${name}').fk.${alias}: '${local}' is a virtual mask ` +
              `— it does not exist in the database.`,
          );
        }
        if (typeof remote !== 'string') {
          at(
            `fk.${alias}.on.${local}`,
            `Entity('${name}').fk.${alias}: no target column given for ` +
              `local column '${local}'`,
          );
        }
      }
      if (fk.reverseProject === true) {
        // Eager to-many would fan every default read out — hasOne only,
        // explicit or derived (FK columns == this entity's pk).
        const cols = Object.keys(fk.on ?? {}).sort();
        const sortedPk = [...pkCols].sort();
        const derivedHasOne = pkCols.length > 0 &&
          cols.length === sortedPk.length &&
          cols.every((c, i) => c === sortedPk[i]);
        const card = fk.reverseCardinality ??
          (derivedHasOne ? 'hasOne' : 'hasMany');
        if (card !== 'hasOne') {
          at(
            `fk.${alias}.reverseProject`,
            `Entity('${name}').fk.${alias}: reverseProject needs a hasOne ` +
              `reverse — declare reverseCardinality: 'hasOne'` +
              (def.type === 'TABLE'
                ? ` or make the FK columns equal this entity's primary key.`
                : ` (views have no primary key to derive it from).`),
          );
        }
      }
      // Referential actions: valid enum, TABLE only (a VIEW's fk is a
      // LOGICAL join with no physical constraint to act on).
      for (const slot of ['onDelete', 'onUpdate'] as const) {
        const action = (fk as Record<string, unknown>)[slot];
        if (action === undefined) continue;
        if (def.type !== 'TABLE') {
          at(
            `fk.${alias}.${slot}`,
            `Entity('${name}').fk.${alias}: ${slot} is meaningless on a ` +
              `${def.type}'s logical join fk — no physical constraint.`,
          );
        } else if (!FK_ACTIONS.has(action as string)) {
          at(
            `fk.${alias}.${slot}`,
            `Entity('${name}').fk.${alias}.${slot}: '${action}' is not a ` +
              `valid referential action (CASCADE, RESTRICT, NO_ACTION, ` +
              `SET_NULL).`,
          );
        }
      }
    }
  };

  // ── Read-only kinds: stored SELECT + hook restrictions ──────────
  if (def.type !== 'TABLE') {
    if (d.query?.type !== 'SELECT') {
      at('query', `Entity('${name}'): ${def.type} query must be a SELECT`);
    }
    if (d.hooks?.beforeInsert || d.hooks?.beforeUpdate) {
      at(
        'hooks',
        `Entity('${name}'): write-side hooks (beforeInsert/beforeUpdate) ` +
          `are meaningless on a read-only ${def.type} — only afterRead ` +
          `applies.`,
      );
    }
    if (def.type === 'QUERY' && d.foreignKeys !== undefined) {
      at(
        'fk',
        `Entity('${name}'): QUERY entities are terminal — they cannot ` +
          `declare foreign keys (use a VIEW for joinable stored SELECTs).`,
      );
    }
    if (def.type === 'VIEW') fkRules([]);
    return issues;
  }

  // ── TABLE: primary key ──────────────────────────────────────────
  const pk = d.primaryKeys ?? [];
  if (pk.length === 0) {
    at(
      'pk',
      `Entity('${name}'): pk must name at least one column ` +
        `(composite keys: list several).`,
    );
  }
  for (const pkCol of pk) {
    const pkSpec = specs[pkCol];
    if (pkSpec === undefined) {
      at('pk', `Entity('${name}').pk: column '${pkCol}' does not exist`);
      continue;
    }
    // Detect REAL siblings by name+source (pick-list scoping stamps
    // the same disable flags onto ordinary out-of-scope columns).
    const siblingSource = hashSourceOf(pkCol) ?? undefined;
    if (siblingSource !== undefined && specs[siblingSource]?.hash === true) {
      at(
        'pk',
        `Entity('${name}').pk: column '${pkCol}' is norm-owned (a ` +
          `synthesized hash sibling) — it cannot be a primary key.`,
      );
    }
    if (pkSpec.nullable === true) {
      at(
        'pk',
        `Entity('${name}').pk: column '${pkCol}' is nullable — ` +
          `primary key columns cannot be.`,
      );
    }
    if (pkSpec.masked !== undefined) {
      at(
        'pk',
        `Entity('${name}'): pk column '${pkCol}' is a virtual mask — it ` +
          `does not exist in the database.`,
      );
    }
    if (pkSpec.encrypt === true) {
      at(
        `columns.${pkCol}.encrypt`,
        `encrypted columns cannot be primary keys — ciphertext is ` +
          `IV-randomized, so the PK constraint cannot deduplicate.`,
      );
    }
  }

  // ── TABLE: foreign keys (shared rules; pk drives hasOne) ───────
  fkRules(pk);

  // ── TABLE: indexes / uniques ────────────────────────────────────
  const idxRules = (
    kind: 'index' | 'unique',
    map: Record<string, readonly string[]> | undefined,
  ) => {
    for (const [idx, cols] of Object.entries(map ?? {})) {
      for (const c of cols) {
        if (!(c in specs)) {
          at(
            `${kind}.${idx}`,
            `Entity('${name}').${kind}.${idx}: column '${c}' does not exist`,
          );
        } else if (specs[c]!.masked !== undefined) {
          at(
            `${kind}.${idx}`,
            `Entity('${name}').${kind}.${idx}: '${c}' is a virtual mask — ` +
              `it does not exist in the database.`,
          );
        }
      }
    }
  };
  idxRules('index', d.indexes);
  idxRules('unique', d.uniques);

  // ── TABLE: rename hint ──────────────────────────────────────────
  if (d.renamedFrom !== undefined) {
    const bare = d.renamedFrom.includes('.')
      ? d.renamedFrom.slice(d.renamedFrom.lastIndexOf('.') + 1)
      : d.renamedFrom;
    if (bare === name && !d.renamedFrom.includes('.')) {
      at(
        'renamedFrom',
        `Entity('${name}'): renamedFrom must name the PREVIOUS physical ` +
          `name, not the current one.`,
      );
    }
  }

  // ── defaultPageSize sanity (all kinds) ──────────────────────────
  const dps = (def as { defaultPageSize?: unknown }).defaultPageSize;
  if (dps !== undefined) {
    if (typeof dps !== 'number' || !Number.isSafeInteger(dps) || dps < 0) {
      at(
        'defaultPageSize',
        `Entity('${name}'): defaultPageSize must be a non-negative ` +
          `integer (0 = unbounded, emits a warning event per read).`,
      );
    }
  }

  return issues;
}

/**
 * Throwing wrapper over {@linkcode definitionIssues}.
 *
 * @throws {@link NormDefinitionError} When `def` violates any definition rule
 *   (columns, primary/foreign keys, indexes, scope, hooks) — the thrown
 *   error's `context.issues` carries every aggregated issue.
 */
export function assertDefinition(def: AnyDefinition): void {
  const issues = definitionIssues(def);
  if (issues.length > 0) throw new NormDefinitionError({ issues });
}
